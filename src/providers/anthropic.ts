import { mergeHeaders } from '../lib/params'
import { isObj } from './merge'
import { readSse } from './sse'
import { fetchModelList, joinUrl, ProviderError, userContent, type ImagePayload, type ProtocolAdapter, type StreamEvent } from './types'

const imageBlock = (img: ImagePayload) => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } })

/** Content blocks that carry reasoning; both kinds belong to the same reasoning, so they're echoed together. */
const REASONING_BLOCKS = ['thinking', 'redacted_thinking']

/** Headers every request needs. Browsers may only call the API with the direct-access opt-in. */
function baseHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

/**
 * Anthropic Messages protocol. The base URL excludes `/v1` (as in Anthropic's SDKs), e.g.
 * `https://api.anthropic.com`. `max_tokens` is required by the API but left to the model's parameters.
 */
export const anthropic: ProtocolAdapter = {
  protocol: 'anthropic',
  chatPath: '/v1/messages',

  buildRequest(provider, model, messages, params) {
    // The system message is a top-level field here, not a message.
    const system = messages.find((m) => m.role === 'system')?.content
    return {
      url: joinUrl(provider.baseUrl, this.chatPath),
      headers: { 'Content-Type': 'application/json', ...baseHeaders(provider.apiKey) },
      body: {
        model,
        ...(system && { system }),
        messages: messages.filter((m) => m.role !== 'system').map((m) => {
          const { role, content, extra } = m
          if (role === 'user') return { role, content: userContent(m, imageBlock, 'text') }
          // Echoed reasoning blocks come first, as the model produced them, then the (possibly edited) text.
          const blocks = Array.isArray(extra?.content) ? extra.content : []
          return blocks.length ? { role, content: [...blocks, { type: 'text', text: content }] } : { role, content }
        }),
        ...params,
        stream: true,
      },
    }
  },

  reserved: ['model', 'system', 'messages', 'stream'],

  /** `fields` name content block types (`thinking`, `redacted_thinking`…); `*` means every non-text block. */
  echo(message, fields) {
    const content = Array.isArray(message.content) ? message.content : []
    const all = fields.includes('*')
    const wanted = fields.length ? fields : REASONING_BLOCKS
    const blocks = content.filter(
      (b) => isObj(b) && b.type !== 'text' && (all || wanted.includes(b.type as string)),
    )
    return blocks.length ? { content: blocks } : undefined
  },

  async *parseStream(body): AsyncGenerator<StreamEvent> {
    let usage: Record<string, unknown> = {}
    for await (const ev of readSse(body)) {
      let json: any
      try {
        json = JSON.parse(ev.data)
      } catch {
        continue
      }
      switch (json.type) {
        case 'message_start':
          if (isObj(json.message?.usage)) usage = { ...json.message.usage }
          break
        case 'content_block_start':
          // A redacted block carries no readable text; the reasoning display shows it as encrypted.
          break
        case 'content_block_delta': {
          const d = json.delta
          if (d?.type === 'text_delta' && d.text) yield { type: 'text', delta: d.text }
          else if (d?.type === 'thinking_delta' && d.thinking) yield { type: 'reasoning', delta: d.thinking }
          break
        }
        case 'message_delta':
          if (json.delta?.stop_reason) yield { type: 'finish', reason: json.delta.stop_reason }
          if (isObj(json.usage)) {
            usage = { ...usage, ...json.usage }
            yield { type: 'usage', usage }
          }
          break
        case 'error':
          throw new ProviderError(json.error?.message ?? 'Stream error', undefined, ev.data)
        case 'message_stop':
          return
      }
    }
  },

  aggregate(payloads) {
    let message: Record<string, any> = {}
    const blocks: Record<string, any>[] = []
    for (const p of payloads) {
      if (!isObj(p)) continue
      if (p.type === 'message_start' && isObj(p.message)) {
        message = structuredClone(p.message)
      } else if (p.type === 'content_block_start' && typeof p.index === 'number' && isObj(p.content_block)) {
        blocks[p.index] = structuredClone(p.content_block)
      } else if (p.type === 'content_block_delta' && typeof p.index === 'number' && isObj(p.delta)) {
        const block = (blocks[p.index] ??= {})
        // Delta fields extend the block: text pieces join (text, thinking, signature, partial_json…),
        // single objects (a citation) are appended to the matching list.
        for (const [k, v] of Object.entries(p.delta)) {
          if (k === 'type') continue
          if (typeof v === 'string') block[k] = (typeof block[k] === 'string' ? block[k] : '') + v
          else if (k === 'citation') (block.citations ??= []).push(v)
          else block[k] = v
        }
      } else if (p.type === 'message_delta') {
        if (isObj(p.delta)) Object.assign(message, p.delta)
        if (isObj(p.usage)) message.usage = { ...message.usage, ...p.usage }
      }
    }
    if (blocks.length) message.content = blocks.filter(Boolean)
    return message
  },

  replyMessage(aggregated) {
    return isObj(aggregated) && Array.isArray(aggregated.content) ? aggregated : undefined
  },

  listModels(provider, headers, signal) {
    return fetchModelList(joinUrl(provider.baseUrl, '/v1/models'), mergeHeaders(baseHeaders(provider.apiKey), headers), signal)
  },
}

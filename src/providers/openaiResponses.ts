import { mergeHeaders } from '../lib/params'
import { isObj } from './merge'
import { readSse } from './sse'
import { fetchModelList, joinUrl, ProviderError, userContent, type ImagePayload, type ProtocolAdapter, type StreamEvent } from './types'

const inputImage = (img: ImagePayload) => ({ type: 'input_image', image_url: `data:${img.mime};base64,${img.data}` })

/**
 * OpenAI Responses protocol. A reply is a list of output items (`reasoning`, `message`…); the native
 * reply we keep is `{ output }`. Echoed items go into `input` before the assistant's message item.
 */
export const openaiResponses: ProtocolAdapter = {
  protocol: 'openai-responses',
  chatPath: '/responses',

  buildRequest(provider, model, messages, params) {
    const input: unknown[] = []
    // The system message goes in `instructions`, the protocol's place for it.
    const instructions = messages.find((m) => m.role === 'system')?.content
    for (const m of messages) {
      const { role, content, extra } = m
      if (role === 'system') continue
      if (role === 'user') {
        input.push({ role, content: userContent(m, inputImage, 'input_text') })
        continue
      }
      const items = Array.isArray(extra?.items) ? extra.items : []
      if (role !== 'assistant' || !isObj(extra?.message)) {
        input.push(...items, { role, content })
        continue
      }
      // Reasoning items must be followed by the message item they belong to: send it in native form,
      // with the (possibly edited) text.
      const msg: Record<string, unknown> = { ...extra.message }
      delete msg.content
      input.push(...items, { ...msg, content: [{ type: 'output_text', text: content, annotations: [] }] })
    }
    return {
      url: joinUrl(provider.baseUrl, this.chatPath),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: { model, ...(instructions && { instructions }), input, ...params, stream: true },
    }
  },

  reserved: ['model', 'instructions', 'input', 'stream'],

  /** `fields` name output item types (`reasoning`…); `*` means every item that isn't the message. */
  echo(message, fields) {
    const output = Array.isArray(message.output) ? message.output.filter(isObj) : []
    const all = fields.includes('*')
    const wanted = fields.length ? fields : ['reasoning']
    const items = output.filter((it) => it.type !== 'message' && (all || wanted.includes(it.type)))
    if (!items.length) return undefined
    const msg = output.find((it) => it.type === 'message')
    return msg ? { items, message: msg } : { items }
  },

  async *parseStream(body): AsyncGenerator<StreamEvent> {
    // Summary parts / reasoning items are separate pieces of reasoning; keep them apart in the display.
    let lastReasoning: string | undefined
    for await (const ev of readSse(body)) {
      let json: any
      try {
        json = JSON.parse(ev.data)
      } catch {
        continue
      }
      switch (json.type) {
        case 'response.output_text.delta':
          if (json.delta) yield { type: 'text', delta: json.delta }
          break
        case 'response.reasoning_summary_text.delta':
        case 'response.reasoning_text.delta': {
          if (!json.delta) break
          const part = `${json.type}:${json.output_index}:${json.summary_index ?? json.content_index ?? 0}`
          if (lastReasoning !== undefined && lastReasoning !== part) yield { type: 'reasoning', delta: '\n\n' }
          lastReasoning = part
          yield { type: 'reasoning', delta: json.delta }
          break
        }
        case 'response.completed':
        case 'response.incomplete': {
          const r = json.response ?? {}
          yield { type: 'finish', reason: r.incomplete_details?.reason ?? r.status ?? 'completed' }
          if (isObj(r.usage)) yield { type: 'usage', usage: r.usage }
          return
        }
        case 'response.failed':
          throw new ProviderError(json.response?.error?.message ?? 'Response failed', undefined, ev.data)
        case 'error':
          throw new ProviderError(json.message ?? json.error?.message ?? 'Stream error', undefined, ev.data)
      }
    }
  },

  aggregate(payloads) {
    let response: Record<string, any> = {}
    const output: Record<string, any>[] = []
    for (const p of payloads) {
      if (!isObj(p)) continue
      const i = p.output_index
      switch (p.type) {
        case 'response.created':
        case 'response.in_progress':
          if (isObj(p.response)) response = structuredClone(p.response)
          break
        case 'response.completed':
        case 'response.incomplete':
        case 'response.failed':
          // The final event carries the whole response, output included.
          if (isObj(p.response)) return structuredClone(p.response)
          break
        case 'response.output_item.added':
        case 'response.output_item.done':
          if (typeof i === 'number' && isObj(p.item)) output[i] = structuredClone(p.item)
          break
        case 'response.output_text.delta':
        case 'response.reasoning_text.delta': {
          if (typeof i !== 'number') break
          const item = (output[i] ??= {})
          const parts = (item.content ??= [])
          const type = p.type === 'response.output_text.delta' ? 'output_text' : 'reasoning_text'
          const part = (parts[p.content_index ?? 0] ??= { type, text: '' })
          part.text = (part.text ?? '') + (p.delta ?? '')
          break
        }
        case 'response.reasoning_summary_text.delta': {
          if (typeof i !== 'number') break
          const item = (output[i] ??= { type: 'reasoning' })
          const parts = (item.summary ??= [])
          const part = (parts[p.summary_index ?? 0] ??= { type: 'summary_text', text: '' })
          part.text = (part.text ?? '') + (p.delta ?? '')
          break
        }
      }
    }
    // Interrupted before the final event: what has arrived so far.
    return { ...response, output: output.filter(Boolean) }
  },

  replyMessage(aggregated) {
    return isObj(aggregated) && Array.isArray(aggregated.output) ? { output: aggregated.output } : undefined
  },

  listModels(provider, headers, signal) {
    const auth = { Authorization: `Bearer ${provider.apiKey}` }
    return fetchModelList(joinUrl(provider.baseUrl, '/models'), mergeHeaders(auth, headers), signal)
  },
}

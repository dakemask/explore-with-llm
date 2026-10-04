import { mergeHeaders } from '../lib/params'
import { readSse } from './sse'
import { isObj, mergeDelta } from './merge'
import { fetchModelList, joinUrl, ProviderError, type ProtocolAdapter, type StreamEvent } from './types'

/** Reasoning fields of a Chat Completions reply, best first; they repeat the same reasoning, so only one is echoed. */
const REASONING_FIELDS = ['reasoning_details', 'reasoning_content', 'reasoning']

/** OpenAI Chat Completions protocol (also used by DeepSeek and most compatible vendors). */
export const openaiChat: ProtocolAdapter = {
  protocol: 'openai-chat',
  chatPath: '/chat/completions',

  buildRequest(provider, model, messages, params) {
    return {
      url: joinUrl(provider.baseUrl, this.chatPath),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: {
        model,
        messages: messages.map(({ role, content, extra }) => (extra ? { role, content, ...extra } : { role, content })),
        ...params,
        stream: true,
      },
    }
  },

  reserved: ['model', 'messages', 'stream'],
  required: [],

  /** Extra fields go straight onto the assistant message. */
  echo(message, fields) {
    if (fields.length === 0) {
      const key = REASONING_FIELDS.find((k) => message[k] != null && message[k] !== '')
      return key ? { [key]: message[key] } : undefined
    }
    const all = fields.includes('*')
    const picked = Object.entries(message).filter(
      ([k]) => k !== 'role' && k !== 'content' && (all || fields.includes(k)),
    )
    return picked.length ? Object.fromEntries(picked) : undefined
  },

  async *parseStream(body): AsyncGenerator<StreamEvent> {
    for await (const ev of readSse(body)) {
      if (ev.data === '[DONE]') return
      let json: any
      try {
        json = JSON.parse(ev.data)
      } catch {
        continue
      }
      if (json.error) {
        throw new ProviderError(json.error.message ?? 'Stream error', undefined, ev.data)
      }
      const choice = json.choices?.[0]
      const delta = choice?.delta
      if (delta) {
        // DeepSeek / several vendors expose chain-of-thought as reasoning_content.
        const reasoning = delta.reasoning_content ?? delta.reasoning
        if (typeof reasoning === 'string' && reasoning) yield { type: 'reasoning', delta: reasoning }
        if (typeof delta.content === 'string' && delta.content) yield { type: 'text', delta: delta.content }
      }
      if (choice?.finish_reason) yield { type: 'finish', reason: choice.finish_reason }
      if (json.usage) yield { type: 'usage', usage: json.usage }
    }
  },

  aggregate(payloads) {
    const head: Record<string, any> = {}
    const choices: Record<string, any>[] = []
    for (const p of payloads) {
      if (!isObj(p)) continue
      const { choices: parts, ...rest } = p
      mergeDelta(head, rest, false)
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        if (!isObj(part)) continue
        const { delta, index = 0, ...partRest } = part
        let choice = choices.find((c) => c.index === index)
        if (!choice) choices.push((choice = { index, message: {} }))
        mergeDelta(choice, partRest, false)
        if (isObj(delta)) mergeDelta(choice.message, delta)
      }
    }
    if (head.object === 'chat.completion.chunk') head.object = 'chat.completion'
    // Field order of a non-streamed response: …, choices, usage.
    const { usage, ...rest } = head
    return usage === undefined ? { ...rest, choices } : { ...rest, choices, usage }
  },

  replyMessage(aggregated) {
    const msg = isObj(aggregated) && Array.isArray(aggregated.choices) ? aggregated.choices[0]?.message : undefined
    return isObj(msg) ? msg : undefined
  },

  listModels(provider, headers, signal) {
    const auth = { Authorization: `Bearer ${provider.apiKey}` }
    return fetchModelList(joinUrl(provider.baseUrl, '/models'), mergeHeaders(auth, headers), signal)
  },
}

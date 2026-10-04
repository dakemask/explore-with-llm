import { readSse } from './sse'
import { isObj, mergeDelta } from './merge'
import { joinUrl, ProviderError, type ProtocolAdapter, type StreamEvent } from './types'

/** OpenAI Chat Completions protocol (also used by DeepSeek and most compatible vendors). */
export const openaiChat: ProtocolAdapter = {
  buildRequest(provider, model, messages) {
    return {
      url: joinUrl(provider.baseUrl, '/chat/completions'),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: {
        model,
        messages: messages.map(({ role, content, extra }) => (extra ? { role, content, ...extra } : { role, content })),
        stream: true,
        stream_options: { include_usage: true },
      },
    }
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
      mergeDelta(head, rest)
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        if (!isObj(part)) continue
        const { delta, index = 0, ...partRest } = part
        let choice = choices.find((c) => c.index === index)
        if (!choice) choices.push((choice = { index, message: {} }))
        mergeDelta(choice, partRest)
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

  async listModels(provider, signal) {
    const res = await fetch(joinUrl(provider.baseUrl, '/models'), {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal,
    })
    const text = await res.text()
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, res.status, text)
    const json = JSON.parse(text)
    const list: unknown[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : []
    return list
      .map((m) => (typeof m === 'string' ? m : (m as { id?: string }).id))
      .filter((id): id is string => !!id)
      .sort()
  },
}

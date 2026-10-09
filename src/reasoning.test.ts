import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { ChatNode, ModelConfig, Provider } from './db/types'
import { buildMessages } from './lib/chat'
import { reasoningView, splitThink } from './lib/reasoning'
import { openaiChat } from './providers/openaiChat'

/** Sending to model `m` of provider `id` (default `p`, the one that produced the replies) with `config`. */
const target = ({ id = 'p', ...config }: ModelConfig & { id?: string } = {}): { provider: Provider; model: string } => ({
  provider: {
    id,
    name: 'P',
    protocol: 'openai-chat',
    baseUrl: 'http://x',
    apiKey: 'k',
    models: ['m'],
    modelConfigs: { m: config },
    createdAt: 0,
  },
  model: 'm',
})

function node(message: Record<string, unknown> | undefined, extra: Partial<ChatNode> = {}): ChatNode {
  return {
    id: 'n',
    conversationId: 'c',
    parentId: null,
    kind: 'main',
    createdAt: 0,
    user: { text: 'q' },
    assistant: { content: 'answer' },
    attempt: {
      status: 'done',
      providerId: 'p',
      providerName: 'P',
      protocol: 'openai-chat',
      model: 'm',
      url: '',
      startedAt: 0,
      rawText: 'answer',
      message,
    },
    ...extra,
  }
}

const native = {
  role: 'assistant',
  content: 'answer (original)',
  reasoning_content: 'thought',
  reasoning_details: [{ type: 'reasoning.encrypted', data: 'ENC', index: 0 }],
}

describe('echo-back', () => {
  it('sends text only by default', () => {
    const [, a] = buildMessages([node(native)], 'next', target())
    expect(a).toEqual({ role: 'assistant', content: 'answer' })
  })

  it('sends nothing extra when switched off, even with fields listed', () => {
    const [, a] = buildMessages([node(native)], 'next', target({ echoReasoning: false, echoFields: ['*'] }))
    expect(a).toEqual({ role: 'assistant', content: 'answer' })
  })

  it('picks only the best reasoning field automatically', () => {
    const [, a] = buildMessages([node(native)], 'next', target({ echoReasoning: true }))
    expect(a.extra).toEqual({ reasoning_details: native.reasoning_details })
    const plain = { role: 'assistant', content: 'x', reasoning_content: 'thought', reasoning: 'thought' }
    const [, b] = buildMessages([node(plain)], 'next', target({ echoReasoning: true }))
    expect(b.extra).toEqual({ reasoning_content: 'thought' })
  })

  it('sends the listed native fields, with current (possibly edited) text', () => {
    const [, a] = buildMessages([node(native)], 'next', target({ echoReasoning: true, echoFields: ['reasoning_details', 'missing'] }))
    expect(a).toEqual({ role: 'assistant', content: 'answer', extra: { reasoning_details: native.reasoning_details } })
  })

  it('sends every native field with *', () => {
    const [, a] = buildMessages([node(native)], 'next', target({ echoReasoning: true, echoFields: ['*'] }))
    expect(a.extra).toEqual({ reasoning_content: 'thought', reasoning_details: native.reasoning_details })
  })

  it('never sends fields to a different provider', () => {
    const [, a] = buildMessages([node(native)], 'next', target({ id: 'other', echoReasoning: true, echoFields: ['*'] }))
    expect(a).toEqual({ role: 'assistant', content: 'answer' })
  })

  it('puts extra fields on the wire message', () => {
    const req = openaiChat.buildRequest(
      target().provider,
      'm',
      [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a', extra: { reasoning_details: [1] } },
      ],
      {},
    )
    expect((req.body as { messages: unknown[] }).messages).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a', reasoning_details: [1] },
    ])
  })

  it('does not concatenate metadata repeated on every chunk (OpenRouter `provider`)', () => {
    const chunk = (delta: object, extra: object = {}) => ({
      id: 'gen-1',
      provider: 'OpenAI',
      model: 'openai/o4',
      choices: [{ index: 0, delta, finish_reason: null, native_finish_reason: null, ...extra }],
    })
    const agg = openaiChat.aggregate([
      chunk({ role: 'assistant', content: '', reasoning: 'Sum', reasoning_details: [{ type: 'reasoning.summary', summary: 'Sum', index: 0 }] }),
      chunk({ content: 'Hi' }),
      chunk({ content: '!' }, { finish_reason: 'stop', native_finish_reason: 'completed' }),
    ]) as Record<string, any>
    expect(agg.provider).toBe('OpenAI')
    expect(agg.choices[0].native_finish_reason).toBe('completed')
    expect(agg.choices[0].message).toEqual({
      role: 'assistant',
      content: 'Hi!',
      reasoning: 'Sum',
      reasoning_details: [{ type: 'reasoning.summary', summary: 'Sum', index: 0 }],
    })
  })

  it('finds the reply message in an aggregated response', () => {
    expect(openaiChat.replyMessage({ choices: [{ index: 0, message: { content: 'x' } }] })).toEqual({ content: 'x' })
    expect(openaiChat.replyMessage({})).toBeUndefined()
  })
})

describe('splitThink', () => {
  it('moves a leading think block to reasoning', () => {
    expect(splitThink('<think>\nhmm\n</think>\n\nHello')).toEqual({ reasoning: 'hmm', content: 'Hello' })
  })
  it('treats an unclosed block as thinking in progress', () => {
    expect(splitThink('<think>still going')).toEqual({ reasoning: 'still going', content: '' })
  })
  it('leaves other text alone', () => {
    expect(splitThink('Use <think> tags')).toEqual({ reasoning: '', content: 'Use <think> tags' })
  })
})

describe('reasoningView', () => {
  it('shows plain reasoning', () => {
    expect(reasoningView('thought', { reasoning_content: 'thought' })).toEqual({
      text: 'thought',
      isSummary: false,
      summaries: [],
      encrypted: [],
    })
  })

  it('labels summary text and counts encrypted blobs', () => {
    const msg = {
      reasoning: 'Sum mary',
      reasoning_details: [
        { type: 'reasoning.summary', summary: 'Sum ', index: 0 },
        { type: 'reasoning.summary', summary: 'mary', index: 0 },
        { type: 'reasoning.encrypted', data: 'abcd', index: 1 },
      ],
    }
    expect(reasoningView('Sum mary', msg)).toEqual({ text: 'Sum mary', isSummary: true, summaries: [], encrypted: [4] })
  })

  it('falls back to reasoning.text details and keeps distinct summaries', () => {
    const msg = {
      reasoning_details: [
        { type: 'reasoning.text', text: 'raw thinking' },
        { type: 'reasoning.summary', summary: 'short' },
      ],
    }
    expect(reasoningView('', msg)).toEqual({ text: 'raw thinking', isSummary: false, summaries: ['short'], encrypted: [] })
  })
})

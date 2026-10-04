import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { ChatNode, Provider } from './db/types'
import { buildMessages } from './lib/chat'
import { reasoningView, splitThink } from './lib/reasoning'
import { openaiChat } from './providers/openaiChat'

const provider = (extra: Partial<Provider> = {}): Provider => ({
  id: 'p',
  name: 'P',
  protocol: 'openai-chat',
  baseUrl: 'http://x',
  apiKey: 'k',
  models: ['m'],
  createdAt: 0,
  ...extra,
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
      requestBody: null,
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
    const [, a] = buildMessages([node(native)], 'next', provider())
    expect(a).toEqual({ role: 'assistant', content: 'answer' })
  })

  it('sends the listed native fields, with current (possibly edited) text', () => {
    const [, a] = buildMessages([node(native)], 'next', provider({ echoFields: ['reasoning_details', 'missing'] }))
    expect(a).toEqual({ role: 'assistant', content: 'answer', extra: { reasoning_details: native.reasoning_details } })
  })

  it('sends every native field with *', () => {
    const [, a] = buildMessages([node(native)], 'next', provider({ echoFields: ['*'] }))
    expect(a.extra).toEqual({ reasoning_content: 'thought', reasoning_details: native.reasoning_details })
  })

  it('never sends fields to a different provider', () => {
    const [, a] = buildMessages([node(native)], 'next', provider({ id: 'other', echoFields: ['*'] }))
    expect(a).toEqual({ role: 'assistant', content: 'answer' })
  })

  it('puts extra fields on the wire message', () => {
    const req = openaiChat.buildRequest(provider(), 'm', [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a', extra: { reasoning_details: [1] } },
    ])
    expect((req.body as { messages: unknown[] }).messages).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a', reasoning_details: [1] },
    ])
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

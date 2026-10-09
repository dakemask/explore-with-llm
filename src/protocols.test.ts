import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { ChatNode, Protocol, Provider } from './db/types'
import { buildMessages } from './lib/chat'
import { reasoningView } from './lib/reasoning'
import { prepareChat } from './providers'
import { anthropic } from './providers/anthropic'
import { openaiResponses } from './providers/openaiResponses'
import type { StreamEvent } from './providers/types'

const provider = (protocol: Protocol, extra: Partial<Provider> = {}): Provider => ({
  id: 'p',
  name: 'P',
  protocol,
  baseUrl: 'http://x/',
  apiKey: 'k',
  models: ['m'],
  createdAt: 0,
  ...extra,
})

function node(protocol: Protocol, message: Record<string, unknown>): ChatNode {
  return {
    id: 'n',
    conversationId: 'c',
    parentId: null,
    kind: 'main',
    createdAt: 0,
    user: { text: 'q' },
    assistant: { content: 'edited answer' },
    attempt: {
      status: 'done',
      providerId: 'p',
      providerName: 'P',
      protocol,
      model: 'm',
      url: '',
      startedAt: 0,
      rawText: 'answer',
      message,
    },
  }
}

/** SSE text with `event:` lines, the way both protocols stream. */
const sse = (events: Record<string, unknown>[]) =>
  events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')

function streamOf(text: string, chunkSize = 11): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let i = 0
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close()
      c.enqueue(bytes.slice(i, (i += chunkSize)))
    },
  })
}

async function collect(gen: AsyncGenerator<StreamEvent>) {
  const out: StreamEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

describe('anthropic', () => {
  const stream = [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } },
    { type: 'ping' },
    { type: 'content_block_start', index: 0, content_block: { type: 'redacted_thinking', data: 'ENC' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'Let me ' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'think.' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'signature_delta', signature: 'SIG' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Hi' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: '!' } },
    { type: 'content_block_stop', index: 2 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 42 } },
    { type: 'message_stop' },
  ]

  it('streams reasoning, text, finish and merged usage', async () => {
    expect(await collect(anthropic.parseStream(streamOf(sse(stream))))).toEqual([
      { type: 'reasoning', delta: 'Let me ' },
      { type: 'reasoning', delta: 'think.' },
      { type: 'text', delta: 'Hi' },
      { type: 'text', delta: '!' },
      { type: 'finish', reason: 'end_turn' },
      { type: 'usage', usage: { input_tokens: 10, output_tokens: 42 } },
    ])
  })

  it('throws on in-stream errors', async () => {
    const gen = anthropic.parseStream(streamOf(sse([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }])))
    await expect(collect(gen)).rejects.toThrow('Overloaded')
  })

  it('rebuilds the message with its content blocks', () => {
    const msg = anthropic.replyMessage(anthropic.aggregate(stream))!
    expect(msg).toMatchObject({
      id: 'msg_1',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 42 },
      content: [
        { type: 'redacted_thinking', data: 'ENC' },
        { type: 'thinking', thinking: 'Let me think.', signature: 'SIG' },
        { type: 'text', text: 'Hi!' },
      ],
    })
    const view = reasoningView('Let me think.', msg)
    expect(view).toMatchObject({ text: 'Let me think.', isSummary: false, encrypted: [3] })
  })

  it('echoes thinking blocks before the edited text, only when switched on', () => {
    const msg = anthropic.replyMessage(anthropic.aggregate(stream))!
    const p = provider('anthropic', { modelConfigs: { m: { echoReasoning: true } } })
    const req = prepareChat(p, 'm', buildMessages([node('anthropic', msg)], 'next', { provider: p, model: 'm' }), { max_tokens: 1024 })
    expect(req.url).toBe('http://x/v1/messages')
    expect(req.headers).toMatchObject({ 'x-api-key': 'k', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })
    expect(req.body).toEqual({
      model: 'm',
      messages: [
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: [
            { type: 'redacted_thinking', data: 'ENC' },
            { type: 'thinking', thinking: 'Let me think.', signature: 'SIG' },
            { type: 'text', text: 'edited answer' },
          ],
        },
        { role: 'user', content: 'next' },
      ],
      max_tokens: 1024,
      stream: true,
    })
    const off = buildMessages([node('anthropic', msg)], 'next', { provider: provider('anthropic'), model: 'm' })
    expect(off[1]).toEqual({ role: 'assistant', content: 'edited answer' })
  })
})

describe('openai-responses', () => {
  const reasoningItem = {
    id: 'rs_1',
    type: 'reasoning',
    summary: [
      { type: 'summary_text', text: 'Plan A' },
      { type: 'summary_text', text: 'Plan B' },
    ],
    encrypted_content: 'ENCRYPTED',
  }
  const message = { id: 'msg_1', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Hi!', annotations: [] }] }
  const head = [
    { type: 'response.created', response: { id: 'resp_1', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { id: 'rs_1', type: 'reasoning', summary: [] } },
    { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, delta: 'Plan ' },
    { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, delta: 'A' },
    { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 1, delta: 'Plan B' },
    { type: 'response.output_item.done', output_index: 0, item: reasoningItem },
    { type: 'response.output_item.added', output_index: 1, item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] } },
    { type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: 'Hi' },
    { type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: '!' },
  ]
  const usage = { input_tokens: 5, output_tokens: 9, output_tokens_details: { reasoning_tokens: 3 } }
  const done = { type: 'response.completed', response: { id: 'resp_1', status: 'completed', output: [reasoningItem, message], usage } }

  it('streams summary parts apart, text, finish and usage', async () => {
    expect(await collect(openaiResponses.parseStream(streamOf(sse([...head, done]))))).toEqual([
      { type: 'reasoning', delta: 'Plan ' },
      { type: 'reasoning', delta: 'A' },
      { type: 'reasoning', delta: '\n\n' },
      { type: 'reasoning', delta: 'Plan B' },
      { type: 'text', delta: 'Hi' },
      { type: 'text', delta: '!' },
      { type: 'finish', reason: 'completed' },
      { type: 'usage', usage },
    ])
  })

  it('throws on failed responses', async () => {
    const failed = { type: 'response.failed', response: { status: 'failed', error: { code: 'server_error', message: 'Nope' } } }
    await expect(collect(openaiResponses.parseStream(streamOf(sse([failed]))))).rejects.toThrow('Nope')
  })

  it('takes the final response, or rebuilds the output when interrupted', () => {
    expect(openaiResponses.replyMessage(openaiResponses.aggregate([...head, done]))).toEqual({ output: [reasoningItem, message] })
    const partial = openaiResponses.aggregate(head) as Record<string, any>
    expect(partial.id).toBe('resp_1')
    expect(partial.output[0]).toEqual(reasoningItem)
    expect(partial.output[1].content).toEqual([{ type: 'output_text', text: 'Hi!' }])
  })

  it('shows summaries and the encrypted size', () => {
    const view = reasoningView('Plan A\n\nPlan B', { output: [reasoningItem, message] })
    expect(view).toMatchObject({ text: 'Plan A\n\nPlan B', isSummary: true, summaries: [], encrypted: [9] })
  })

  it('echoes reasoning items before the native message item with the edited text', () => {
    const p = provider('openai-responses', { modelConfigs: { m: { echoReasoning: true } } })
    const req = prepareChat(p, 'm', buildMessages([node('openai-responses', { output: [reasoningItem, message] })], 'next', { provider: p, model: 'm' }))
    expect(req.url).toBe('http://x/responses')
    expect(req.body).toEqual({
      model: 'm',
      input: [
        { role: 'user', content: 'q' },
        reasoningItem,
        { id: 'msg_1', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'edited answer', annotations: [] }] },
        { role: 'user', content: 'next' },
      ],
      stream: true,
    })
    const off = prepareChat(p, 'm', buildMessages([node('openai-responses', { output: [reasoningItem, message] })], 'next', { provider: provider('openai-responses'), model: 'm' }))
    expect((off.body as { input: unknown[] }).input[1]).toEqual({ role: 'assistant', content: 'edited answer' })
  })

  it('never echoes a reply recorded under another protocol', () => {
    const p = provider('openai-responses', { modelConfigs: { m: { echoReasoning: true } } })
    const msgs = buildMessages([node('openai-chat', { role: 'assistant', content: 'x', reasoning_content: 'r' })], 'next', { provider: p, model: 'm' })
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'edited answer' })
  })
})

describe('system message', () => {
  const first = { ...node('openai-chat', {}), system: 'Be brief.' }
  const messages = buildMessages([first], 'next')

  it('comes first, from the path’s first turn', () => {
    expect(messages[0]).toEqual({ role: 'system', content: 'Be brief.' })
    expect(buildMessages([], 'hi', undefined, undefined, 'New.')[0]).toEqual({ role: 'system', content: 'New.' })
    expect(buildMessages([node('openai-chat', {})], 'next')[0].role).toBe('user')
  })

  it('goes in each protocol’s own place', () => {
    const chat = prepareChat(provider('openai-chat'), 'm', messages, {}).body as any
    expect(chat.messages[0]).toEqual({ role: 'system', content: 'Be brief.' })
    const claude = prepareChat(provider('anthropic'), 'm', messages, {}).body as any
    expect(claude.system).toBe('Be brief.')
    expect(claude.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user'])
    const responses = prepareChat(provider('openai-responses'), 'm', messages, {}).body as any
    expect(responses.instructions).toBe('Be brief.')
    expect(responses.input.some((m: any) => m.role === 'system')).toBe(false)
    // Parameter configs may not set it a second way.
    expect(anthropic.reserved).toContain('system')
    expect(openaiResponses.reserved).toContain('instructions')
  })
})

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { normalizeMath } from './components/chat/Markdown'
import { ROOT_KEY, type ChatNode } from './db/types'
import { db } from './db'
import { foldHistory, maskHeader, prettyJson, streamEvents, summarizeUsage } from './lib/attempt'
import { buildMessages, createConversation, selectBranch } from './lib/chat'
import { activePath, pathTo, siblingsOf } from './lib/tree'
import { openaiChat } from './providers/openaiChat'
import { SseParser } from './providers/sse'

function node(id: string, parentId: string | null, createdAt: number, extra: Partial<ChatNode> = {}): ChatNode {
  return {
    id,
    conversationId: 'c',
    parentId,
    kind: 'main',
    createdAt,
    user: { text: `u-${id}` },
    assistant: { content: `a-${id}` },
    attempt: {
      status: 'done',
      providerId: 'p',
      providerName: 'P',
      protocol: 'openai-chat',
      model: 'm',
      url: '',
      requestBody: null,
      startedAt: 0,
      rawText: '',
    },
    ...extra,
  }
}

function streamOf(text: string, chunkSize = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunkSize) c.enqueue(bytes.slice(i, i + chunkSize))
      c.close()
    },
  })
}

describe('SseParser', () => {
  it('handles events split across chunks and CRLF', () => {
    const p = new SseParser()
    expect(p.push('data: {"a"')).toEqual([])
    expect(p.push(':1}\r\n\r\ndata: x\n')).toEqual([{ event: undefined, data: '{"a":1}' }])
    expect(p.push('\n')).toEqual([{ event: undefined, data: 'x' }])
  })

  it('ignores comments and joins multi-line data', () => {
    const p = new SseParser()
    expect(p.push(': ping\n\nevent: e\ndata: a\ndata: b\n\n')).toEqual([{ event: 'e', data: 'a\nb' }])
  })
})

describe('openaiChat.parseStream', () => {
  it('yields reasoning, text, finish and usage, stopping at [DONE]', async () => {
    const sse = [
      { choices: [{ delta: { reasoning_content: '思考' } }] },
      { choices: [{ delta: { content: '你好' } }] },
      { choices: [{ delta: { content: '，世界' }, finish_reason: 'stop' }] },
      { choices: [], usage: { total_tokens: 9 } },
    ]
      .map((j) => `data: ${JSON.stringify(j)}\n\n`)
      .join('')
      .concat('data: [DONE]\n\ndata: {"choices":[{"delta":{"content":"ignored"}}]}\n\n')

    const events = []
    for await (const ev of openaiChat.parseStream(streamOf(sse))) events.push(ev)
    expect(events).toEqual([
      { type: 'reasoning', delta: '思考' },
      { type: 'text', delta: '你好' },
      { type: 'text', delta: '，世界' },
      { type: 'finish', reason: 'stop' },
      { type: 'usage', usage: { total_tokens: 9 } },
    ])
  })

  it('throws on in-stream error objects', async () => {
    const it = openaiChat.parseStream(streamOf('data: {"error":{"message":"boom"}}\n\n'))
    await expect(it.next()).rejects.toThrow('boom')
  })
})

describe('tree', () => {
  //      a
  //     / \
  //    b   c      (c newer)
  //    |
  //    d
  const nodes = [node('a', null, 1), node('b', 'a', 2), node('c', 'a', 3), node('d', 'b', 4)]

  it('follows the newest child by default', () => {
    expect(activePath(nodes, {}).map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('follows remembered selections', () => {
    expect(activePath(nodes, { a: 'b' }).map((n) => n.id)).toEqual(['a', 'b', 'd'])
  })

  it('ignores side-question nodes on the main line', () => {
    const withSide = [...nodes, node('s', 'a', 9, { kind: 'side' })]
    expect(activePath(withSide, { [ROOT_KEY]: 'a' }).map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('pathTo returns root→node', () => {
    expect(pathTo(nodes, 'd').map((n) => n.id)).toEqual(['a', 'b', 'd'])
  })

  it('siblingsOf lists versions at a fork, oldest first, excluding side questions', () => {
    const withSide = [...nodes, node('s', 'a', 9, { kind: 'side' })]
    expect(siblingsOf(withSide, nodes[2]).map((n) => n.id)).toEqual(['b', 'c'])
    expect(siblingsOf(withSide, nodes[0]).map((n) => n.id)).toEqual(['a'])
  })
})

describe('selectBranch', () => {
  it('switches the shown child at one fork and keeps the others', async () => {
    const id = await createConversation()
    await db.conversations.update(id, { selectedChild: { [ROOT_KEY]: 'a', a: 'c' } })
    await selectBranch(id, 'a', 'b')
    await selectBranch(id, null, 'z')
    expect((await db.conversations.get(id))?.selectedChild).toEqual({ [ROOT_KEY]: 'z', a: 'b' })
  })
})

describe('buildMessages', () => {
  it('alternates turns and skips empty assistant replies', () => {
    const path = [node('a', null, 1), node('b', 'a', 2, { assistant: { content: '' } })]
    expect(buildMessages(path, 'next')).toEqual([
      { role: 'user', content: 'u-a' },
      { role: 'assistant', content: 'a-a' },
      { role: 'user', content: 'u-b' },
      { role: 'user', content: 'next' },
    ])
  })

  it('uses edited assistant content, not the raw response', () => {
    const n = node('a', null, 1, { assistant: { content: 'edited', edited: true } })
    n.attempt.rawText = 'original'
    expect(buildMessages([n], 'q')[1]).toEqual({ role: 'assistant', content: 'edited' })
  })
})

describe('normalizeMath', () => {
  it('converts \\( \\) and \\[ \\] delimiters', () => {
    expect(normalizeMath('a \\(x^2\\) b')).toBe('a $x^2$ b')
    expect(normalizeMath('\\[y\\]')).toBe('$$\ny\n$$')
    expect(normalizeMath('a \\[y\\] b')).toBe('a \n$$\ny\n$$\n b')
  })

  it('leaves code untouched', () => {
    const src = '```\n\\(x\\)\n```\nand `\\[y\\]`'
    expect(normalizeMath(src)).toBe(src)
  })
})

describe('attempt helpers', () => {
  it('summarizes OpenAI / DeepSeek usage', () => {
    expect(
      summarizeUsage({
        prompt_tokens: 10,
        completion_tokens: 30,
        prompt_cache_hit_tokens: 4,
        completion_tokens_details: { reasoning_tokens: 12 },
      }),
    ).toEqual({ input: 10, output: 30, reasoning: 12, cached: 4 })
  })

  it('summarizes Anthropic-style usage and ignores unknown shapes', () => {
    expect(summarizeUsage({ input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 2 })).toEqual({
      input: 5,
      output: 7,
      reasoning: undefined,
      cached: 2,
    })
    expect(summarizeUsage({ foo: 1 })).toBeNull()
    expect(summarizeUsage(undefined)).toBeNull()
  })

  it('folds all but the last message out of a request body', () => {
    const body = {
      model: 'm',
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ],
      stream: true,
    }
    const f = foldHistory(body)!
    expect(f.hidden).toBe(2)
    expect(f.indent).toBe('    ')
    expect(f.before.endsWith('"messages": [\n')).toBe(true)
    expect(f.after).toContain('"content": "c"')
    expect(f.after).not.toContain('"content": "a"')
    expect(f.before + f.after).not.toContain('__ewl_fold__')
    expect(foldHistory({ messages: [{ role: 'user', content: 'only' }] })).toBeNull()
  })

  it('masks credential headers only', () => {
    expect(maskHeader('Authorization', 'Bearer sk-1234567890abcd')).toBe('Bearer sk-…abcd')
    expect(maskHeader('x-api-key', 'short')).toBe('•••••')
    expect(maskHeader('Content-Type', 'application/json')).toBe('application/json')
  })

  it('splits recorded chunks into timed events', () => {
    const evs = streamEvents([
      { t: 5, text: 'data: {"a"' },
      { t: 9, text: ':1}\n\ndata: [DONE]\n\n' },
    ])
    expect(evs).toEqual([
      { t: 9, event: undefined, data: '{"a":1}', json: { a: 1 } },
      { t: 9, event: undefined, data: '[DONE]', json: undefined },
    ])
  })

  it('pretty-prints JSON and rejects non-JSON', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyJson('<html>')).toBeNull()
  })
})

describe('openaiChat.aggregate', () => {
  it('rebuilds a non-streamed completion, keeping unknown vendor fields', () => {
    const chunks = [
      { id: 'x', object: 'chat.completion.chunk', model: 'm', choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] },
      { id: 'x', object: 'chat.completion.chunk', model: 'm', choices: [{ index: 0, delta: { reasoning_content: '想' } }] },
      {
        id: 'x',
        choices: [{ index: 0, delta: { reasoning_details: [{ type: 'reasoning.text', index: 0, text: 'a' }] } }],
      },
      {
        id: 'x',
        choices: [{ index: 0, delta: { reasoning_details: [{ type: 'reasoning.text', index: 0, text: 'b' }] } }],
      },
      {
        id: 'x',
        choices: [{ index: 0, delta: { reasoning_details: [{ type: 'reasoning.encrypted', index: 1, data: 'ENC' }] } }],
      },
      { id: 'x', choices: [{ index: 0, delta: { role: 'assistant', content: '你' }, finish_reason: null }] },
      { id: 'x', choices: [{ index: 0, delta: { content: '好' }, finish_reason: 'stop' }], usage: null },
      { id: 'x', choices: [], usage: { total_tokens: 3 } },
    ]
    expect(openaiChat.aggregate(chunks)).toEqual({
      id: 'x',
      object: 'chat.completion',
      model: 'm',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: '你好',
            reasoning_content: '想',
            reasoning_details: [
              { type: 'reasoning.text', index: 0, text: 'ab' },
              { type: 'reasoning.encrypted', index: 1, data: 'ENC' },
            ],
          },
        },
      ],
      usage: { total_tokens: 3 },
    })
  })
})

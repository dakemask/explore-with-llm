import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { normalizeMath } from './components/chat/Markdown'
import { ROOT_KEY, type ChatNode } from './db/types'
import { buildMessages } from './lib/chat'
import { activePath, pathTo } from './lib/tree'
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
    expect(normalizeMath('\\[y\\]')).toBe('\n$$\ny\n$$\n')
  })

  it('leaves code untouched', () => {
    const src = '```\n\\(x\\)\n```\nand `\\[y\\]`'
    expect(normalizeMath(src)).toBe(src)
  })
})

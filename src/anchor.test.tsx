import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './components/chat/Markdown'
import type { ChatNode } from './db/types'
import { editRegion, normalizeMathMapped, shiftLocks, type AnchorMark } from './lib/anchor'
import { buildMessages } from './lib/chat'
import { activePath, forkKey, siblingsOf, sideThreads, threadPath } from './lib/tree'
import { useSettings } from './store/settings'

/** [text, data-s, data-e] of every source-mapped run, in document order. */
function runs(src: string, anchors: AnchorMark[] = []) {
  const html = renderToStaticMarkup(<Markdown text={src} anchors={anchors} />)
  return [...html.matchAll(/<(span|mark)[^>]*data-s="(\d+)" data-e="(\d+)"[^>]*>([^<]*)<\/\1>/g)].map((m) => ({
    tag: m[1],
    text: m[4],
    src: src.slice(Number(m[2]), Number(m[3])),
  }))
}

describe('normalizeMathMapped', () => {
  it('maps rewritten math back to the original delimiters', () => {
    const src = 'a \\(x\\) b \\[ y \\] c'
    const { text, map } = normalizeMathMapped(src)
    expect(text).toBe('a $x$ b \n$$\ny\n$$\n c')
    expect(src[map[text.indexOf('x')]]).toBe('x')
    expect(src[map[text.indexOf('y')]]).toBe('y')
    expect(src.slice(map[text.indexOf(' c')])).toBe(' c')
  })
})

describe('rehypeAnchors', () => {
  it('records the source range of each rendered run', () => {
    const r = runs('Hi **bo&amp;ld** a\\*b `code` end')
    expect(r.map((x) => x.src)).toEqual(['Hi ', 'bo&amp;ld', ' a\\*b ', '`code`', ' end'])
  })

  it('maps highlighted code exactly', () => {
    const src = 'x\n\n```js\nconst a = 1\n```\n'
    const r = runs(src)
    expect(r.every((x) => x.text === x.src.replace(/&/g, '&amp;'))).toBe(true)
    expect(r.map((x) => x.text).join('')).toContain('const a = 1')
  })

  it('highlights anchored ranges, splitting runs at the boundaries', () => {
    const src = 'Hello brave new world'
    const r = runs(src, [{ id: 't1', start: 6, end: 15 }])
    expect(r).toEqual([
      { tag: 'span', text: 'Hello ', src: 'Hello ' },
      { tag: 'mark', text: 'brave new', src: 'brave new' },
      { tag: 'span', text: ' world', src: ' world' },
    ])
  })

  it('treats rendered math as one atomic range', () => {
    const src = 'see \\(x^2\\) here'
    const html = renderToStaticMarkup(<Markdown text={src} anchors={[{ id: 't', start: 4, end: 11 }]} />)
    const m = /class="katex anchor-hl"[^>]*data-s="(\d+)" data-e="(\d+)"[^>]*data-threads="t"/.exec(html)
    expect(m && src.slice(Number(m[1]), Number(m[2]))).toBe('\\(x^2\\)')
  })
})

describe('locks', () => {
  it('uses the caret to place an edit among repeated characters', () => {
    // "xab" → "xaab", typed an "a" at index 1 (caret ends at 2)
    expect(editRegion('xab', 'xaab', 2)).toEqual({ from: 1, to: 1, delta: 1 })
  })

  it('allows edits outside and at the edges of a lock, shifting it', () => {
    const locks = [{ start: 4, end: 9 }] // "abc [LOCK] def"
    expect(shiftLocks(locks, 'abc LOCKED def', 'abcX LOCKED def', 4)).toEqual([{ start: 5, end: 10 }])
    expect(shiftLocks(locks, 'abc LOCKED def', 'abc LOCKED defX', 15)).toEqual(locks)
    expect(shiftLocks([{ start: 4, end: 10 }], 'abc LOCKED def', 'abc ZLOCKED def', 5)).toEqual([{ start: 5, end: 11 }])
  })

  it('rejects edits inside a lock', () => {
    const locks = [{ start: 4, end: 10 }]
    expect(shiftLocks(locks, 'abc LOCKED def', 'abc LOCKXED def', 9)).toBeNull()
    expect(shiftLocks(locks, 'abc LOCKED def', 'abc def', 4)).toBeNull()
  })
})

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

describe('side threads', () => {
  const anchor = { start: 0, end: 3, text: 'a-a' }
  const nodes = [
    node('a', null, 1),
    node('b', 'a', 2),
    node('s1', 'a', 3, { kind: 'side', thread: 'T', anchor }),
    node('s2', 'a', 4, { kind: 'side', thread: 'T', anchor }),
    node('s3', 's1', 5, { kind: 'side', thread: 'T' }),
    node('o1', 'a', 6, { kind: 'side', thread: 'U', anchor }),
  ]

  it('keeps threads off the main line and apart from each other', () => {
    expect(activePath(nodes, {}).map((n) => n.id)).toEqual(['a', 'b'])
    expect(siblingsOf(nodes, nodes[2]).map((n) => n.id)).toEqual(['s1', 's2'])
    expect(sideThreads(nodes, 'a').map((t) => [t.thread, t.roots.length])).toEqual([
      ['T', 2],
      ['U', 1],
    ])
  })

  it('remembers the shown root version under the thread id', () => {
    expect(forkKey(nodes[2])).toBe('T')
    expect(forkKey(nodes[4])).toBe('s1')
    expect(threadPath(nodes, 'T', {}).map((n) => n.id)).toEqual(['s2'])
    expect(threadPath(nodes, 'T', { T: 's1' }).map((n) => n.id)).toEqual(['s1', 's3'])
  })

  it('sends the main path, then the quoted text with the question', () => {
    useSettings.setState({ lang: 'en' })
    const msgs = buildMessages([nodes[0], nodes[2]], 'more?')
    expect(msgs.map((m) => m.content)).toEqual([
      'u-a',
      'a-a',
      'About this part of your answer above:\n\n> a-a\n\nu-s1',
      'a-s1',
      'more?',
    ])
  })
})

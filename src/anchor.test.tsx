import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './components/chat/Markdown'
import type { ChatNode } from './db/types'
import { normalizeMathMapped, quoteForInput, type AnchorMark } from './lib/anchor'
import { db } from './db'
import { buildMessages, editAssistant, replyVersions } from './lib/chat'
import { activePath, forkKey, siblingsOf, sideThreads, threadPath } from './lib/tree'

/** [text, data-s, data-e] of every source-mapped run, in document order. */
function runs(src: string, anchors: AnchorMark[] = [], breaks = false) {
  const html = renderToStaticMarkup(<Markdown text={src} anchors={anchors} breaks={breaks} />)
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

describe('display math in containers', () => {
  it('stays inside a blockquote', () => {
    const src = '> 如果\n> \\[\n> \\det x\n> \\]\n>\n> 是常数\n'
    expect(normalizeMathMapped(src).text).toBe('> 如果\n> $$\n> \\det x\n> $$\n>\n> 是常数\n')
    const html = renderToStaticMarkup(<Markdown text={src} />)
    expect(html.match(/<blockquote>/g)?.length).toBe(1)
    expect(html).toContain('katex-display')
    expect(html).not.toContain('&gt;')
  })

  it('stays inside a list item, and splits inline-placed display math onto its own lines', () => {
    const src = '1. 设\n   \\[ x = 1 \\] 于是'
    expect(normalizeMathMapped(src).text).toBe('1. 设\n   $$\n   x = 1\n   $$\n    于是')
    const html = renderToStaticMarkup(<Markdown text={src} />)
    expect(html.match(/<li>/g)?.length).toBe(1)
    expect(html).toContain('katex-display')
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

  it('maps user messages, whose single newlines are line breaks', () => {
    const src = 'ab\nba **x**\ny\n\n> q1\n> q2'
    const r = runs(src, [], true)
    expect(r.map((x) => [x.text, x.src])).toEqual([
      ['ab', 'ab'],
      ['ba ', 'ba '],
      ['x', 'x'],
      ['y', 'y'],
      ['q1', 'q1'],
      ['q2', '> q2'],
    ])
    const html = renderToStaticMarkup(<Markdown text={src} anchors={[]} breaks />)
    expect(html.match(/<br/g)?.length).toBe(3)
  })

  it('highlights notes in their own style, side questions and notes together where they overlap', () => {
    const src = 'one\ntwo three'
    const r = runs(src, [{ id: 'note:n', start: 4, end: 13, note: true }, { id: 't', start: 8, end: 13 }], true)
    expect(r.map((x) => [x.tag, x.src])).toEqual([
      ['span', 'one'],
      ['mark', 'two '],
      ['mark', 'three'],
    ])
    const html = renderToStaticMarkup(
      <Markdown text={src} anchors={[{ id: 'note:n', start: 4, end: 13, note: true, active: true }, { id: 't', start: 8, end: 13 }]} breaks />,
    )
    expect(html).toContain('data-s="4" data-e="8" class="anchor-note note-active" data-threads="note:n"')
    expect(html).toContain('data-s="8" data-e="13" class="anchor-hl anchor-note note-active" data-threads="note:n t"')
  })

  it('treats rendered math as one atomic range', () => {
    const src = 'see \\(x^2\\) here'
    const html = renderToStaticMarkup(<Markdown text={src} anchors={[{ id: 't', start: 4, end: 11 }]} />)
    const m = /class="katex anchor-hl"[^>]*data-s="(\d+)" data-e="(\d+)"[^>]*data-threads="t"/.exec(html)
    expect(m && src.slice(Number(m[1]), Number(m[2]))).toBe('\\(x^2\\)')
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

  it('sends the main path, then the side thread, as typed', () => {
    const msgs = buildMessages([nodes[0], nodes[2]], 'more?')
    expect(msgs.map((m) => m.content)).toEqual(['u-a', 'a-a', 'u-s1', 'a-s1', 'more?'])
  })

  it('prefills the input with the selection as a blockquote', () => {
    expect(quoteForInput('1. **缩小**一半\n\n公式 $x$')).toBe('> 缩小一半\n>\n> 公式 $x$\n\n')
  })
})

describe('editing a reply', () => {
  it('makes a shown sibling with the edit history, no reasoning and no echo', async () => {
    const anchor = { start: 0, end: 3, text: 'one' }
    const n = node('v', 'p0', 1, {
      kind: 'side',
      thread: 'T',
      anchor,
      assistant: { content: 'one', reasoning: 'r' },
    })
    n.attempt.finishedAt = 100
    n.attempt.message = { role: 'assistant', content: 'one', reasoning_content: 'r' }
    await db.conversations.put({ id: 'c', title: '', createdAt: 0, updatedAt: 0, selectedChild: {} })
    await db.nodes.put(n)

    const id2 = await editAssistant(n, 'two')
    const id3 = await editAssistant((await db.nodes.get(id2))!, 'three')
    const [v, e2, e3] = [(await db.nodes.get('v'))!, (await db.nodes.get(id2))!, (await db.nodes.get(id3))!]

    expect(v.assistant).toEqual({ content: 'one', reasoning: 'r' })
    expect(e3).toMatchObject({ parentId: 'p0', kind: 'side', thread: 'T', anchor, assistant: { content: 'three' } })
    expect(e3.attempt).toEqual(n.attempt)
    expect(e3.edit).toMatchObject({ from: id2, history: [{ content: 'one', at: 100 }, { content: 'two', at: e2.edit!.at }] })
    expect(replyVersions(e3).map((x) => [x.kind, x.content])).toEqual([
      ['current', 'three'],
      ['edit', 'two'],
      ['original', 'one'],
    ])
    expect(replyVersions(v)).toEqual([])
    expect((await db.conversations.get('c'))!.selectedChild).toEqual({ T: id3 })

    const target = {
      provider: {
        id: 'p', name: 'P', protocol: 'openai-chat' as const, baseUrl: '', apiKey: '', models: ['m'],
        modelConfigs: { m: { echoReasoning: true } }, createdAt: 0,
      },
      model: 'm',
    }
    expect(buildMessages([v], 'q', target)[1]).toMatchObject({ extra: { reasoning_content: 'r' } })
    expect(buildMessages([e3], 'q', target)[1]).toEqual({ role: 'assistant', content: 'three' })
  })
})

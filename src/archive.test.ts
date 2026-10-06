import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, ROOT_KEY, type ChatNode } from './db'
import { archiveNode, archiveThread, deleteArchived, restoreArchived, sendMessage } from './lib/chat'
import {
  activePath,
  archivedItems,
  busyIds,
  deriveBranches,
  isHidden,
  sideThreads,
  siblingsOf,
  subtreeIds,
  threadPath,
  threadRoots,
} from './lib/tree'
import { exportConversation, importConversation } from './lib/transfer'

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

const anchor = { start: 0, end: 1, text: 'a' }
const side = (id: string, parentId: string, t: number, thread: string, root = false) =>
  node(id, parentId, t, { kind: 'side', thread, ...(root && { anchor }) })

//      a
//     / \
//    b   c        s1, s2: two root versions of thread T on b; s3 a follow-up of s1
//    |
//    d
const base = [
  node('a', null, 1),
  node('b', 'a', 2),
  node('c', 'a', 3),
  node('d', 'b', 4),
  side('s1', 'b', 5, 'T', true),
  side('s2', 'b', 6, 'T', true),
  side('s3', 's1', 7, 'T'),
]
const with_ = (patch: Record<string, Partial<ChatNode>>) => base.map((n) => (patch[n.id] ? { ...n, ...patch[n.id] } : n))
const ids = (list: ChatNode[]) => list.map((n) => n.id)

describe('tree helpers skip archived nodes', () => {
  it('falls back to the newest remaining child when the shown one is archived', () => {
    const nodes = with_({ b: { archived: 10 } })
    expect(ids(activePath(base, { a: 'b' }))).toEqual(['a', 'b', 'd'])
    expect(ids(activePath(nodes, { a: 'b' }))).toEqual(['a', 'c'])
    expect(ids(siblingsOf(nodes, nodes[2]))).toEqual(['c'])
  })

  it('ends the path at the parent when no child remains', () => {
    const nodes = with_({ b: { archived: 10 }, c: { archived: 11 } })
    expect(ids(activePath(nodes, {}))).toEqual(['a'])
    expect(ids(activePath(with_({ a: { archived: 1 } }), {}))).toEqual([])
  })

  it('hides archived side threads and root versions', () => {
    expect(sideThreads(base, 'b').map((t) => ids(t.roots))).toEqual([['s1', 's2']])
    const nodes = with_({ s1: { archived: 10 }, s2: { archived: 10 } })
    expect(sideThreads(nodes, 'b')).toEqual([])
    expect(threadRoots(nodes, 'T')).toEqual([])
    expect(threadPath(nodes, 'T', {})).toEqual([])
    expect(ids(threadPath(with_({ s2: { archived: 10 } }), 'T', { T: 's2' }))).toEqual(['s1', 's3'])
  })

  it('isHidden looks at the node and everything above it', () => {
    const nodes = with_({ b: { archived: 10 } })
    expect(isHidden(nodes, 'b')).toBe(true)
    expect(isHidden(nodes, 'd')).toBe(true)
    expect(isHidden(nodes, 's3')).toBe(true)
    expect(isHidden(nodes, 'c')).toBe(false)
  })

  it('busyIds marks a streaming node and everything above it', () => {
    const nodes = base.map((n) => (n.id === 's3' ? { ...n, attempt: { ...n.attempt, status: 'streaming' as const } } : n))
    expect([...busyIds(nodes)].sort()).toEqual(['a', 'b', 's1', 's3'])
  })
})

describe('archive entries', () => {
  it('lists archived nodes and threads newest first, with kind and size', () => {
    const nodes = with_({ b: { archived: 10, branch: true }, c: { archived: 30 }, s1: { archived: 20 }, s2: { archived: 20 } })
    const items = archivedItems(nodes)
    expect(items.map((i) => [i.key, i.kind, i.size])).toEqual([
      ['c', 'attempt', 1],
      ['T', 'side', 3],
      ['b', 'branch', 5],
    ])
    expect(ids(items[1].nodes)).toEqual(['s1', 's2'])
    expect(items[1].parentId).toBe('b')
  })

  it('blocks restoring until an archived ancestor is restored', () => {
    const nodes = with_({ a: { archived: 20 }, d: { archived: 10 }, s1: { archived: 5 }, s2: { archived: 5 } })
    const blocked = Object.fromEntries(archivedItems(nodes).map((i) => [i.key, i.blocked]))
    expect(blocked).toEqual({ a: false, d: true, T: true })
    const after = Object.fromEntries(archivedItems(with_({ d: { archived: 10 } })).map((i) => [i.key, i.blocked]))
    expect(after).toEqual({ d: false })
  })

  it('subtreeIds covers main descendants and side threads below', () => {
    expect([...subtreeIds(base, ['b'])].sort()).toEqual(['b', 'd', 's1', 's2', 's3'])
    expect([...subtreeIds(base, ['s1', 's2'])].sort()).toEqual(['s1', 's2', 's3'])
    expect([...subtreeIds(base, ['c'])]).toEqual(['c'])
  })
})

describe('branch rule', () => {
  it('derives branches from main children and side questions', () => {
    const plain = [node('a', null, 1), node('b', 'a', 2), node('c', 'b', 3), node('x', null, 4), side('s', 'x', 5, 'T', true), node('y', null, 6)]
    const out = deriveBranches(plain)
    expect(out.filter((n) => n.branch).map((n) => n.id)).toEqual(['a', 'b', 'x'])
    expect(out[2]).toBe(plain[2])
  })
})

describe('archive actions (db)', () => {
  beforeEach(async () => {
    await Promise.all([db.conversations.clear(), db.nodes.clear(), db.images.clear(), db.providers.clear()])
    await db.conversations.add({
      id: 'c',
      title: 'T',
      createdAt: 0,
      updatedAt: 0,
      selectedChild: { [ROOT_KEY]: 'a', a: 'b', T: 's2', s1: 's3' },
      threadTitles: { T: 'side title' },
    })
    await db.nodes.bulkAdd(
      base.map((n) => (n.id === 'd' ? { ...n, user: { text: 'pic', images: ['img1'] } } : n.id === 'a' ? { ...n, user: { text: 'pic', images: ['img2'] } } : n)),
    )
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await db.images.bulkAdd([
      { id: 'img1', conversationId: 'c', blob, mime: 'image/png', width: 1, height: 1, createdAt: 0 },
      { id: 'img2', conversationId: 'c', blob, mime: 'image/png', width: 1, height: 1, createdAt: 0 },
    ])
  })

  it('archives and restores a node and a thread', async () => {
    await archiveNode('b')
    await archiveThread('c', 'T')
    const nodes = await db.nodes.toArray()
    expect(nodes.filter((n) => n.archived).map((n) => n.id).sort()).toEqual(['b', 's1', 's2'])
    expect(nodes.find((n) => n.id === 's1')!.archived).toBe(nodes.find((n) => n.id === 's2')!.archived)
    await restoreArchived('c', ['s1', 's2'])
    await restoreArchived('c', ['b'])
    expect((await db.nodes.toArray()).some((n) => 'archived' in n)).toBe(false)
  })

  it('keeps the view when restoring the node that was shown', async () => {
    await archiveNode('b')
    expect(ids(activePath(await db.nodes.toArray(), (await db.conversations.get('c'))!.selectedChild))).toEqual(['a', 'c'])
    await restoreArchived('c', ['b'])
    expect(ids(activePath(await db.nodes.toArray(), (await db.conversations.get('c'))!.selectedChild))).toEqual(['a', 'c'])
  })

  it('deletes a subtree forever with its selections, titles and images', async () => {
    await archiveNode('b')
    await deleteArchived('c', ['b'])
    expect(ids(await db.nodes.toArray()).sort()).toEqual(['a', 'c'])
    const conv = (await db.conversations.get('c'))!
    expect(conv.selectedChild).toEqual({ [ROOT_KEY]: 'a' })
    expect(conv.threadTitles).toEqual({})
    expect(await db.images.toCollection().primaryKeys()).toEqual(['img2'])
  })

  it('a follow-up or a side question makes its main node a branch; new nodes are attempts', async () => {
    const provider = { id: 'p', name: 'P', protocol: 'openai-chat' as const, baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'k', models: ['m'], createdAt: 0 }
    // No images in the context (FileReader is missing under Node).
    await db.nodes.bulkUpdate([{ key: 'a', changes: { user: { text: 'a' } } }, { key: 'd', changes: { user: { text: 'd' } } }])
    await sendMessage({ conversationId: 'c', parentId: 'c', text: 'next', provider, model: 'm' })
    await sendMessage({ conversationId: 'c', parentId: 'd', text: '> q', provider, model: 'm', side: { thread: 'T2', anchor } })
    const nodes = await db.nodes.toArray()
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
    expect(byId.c.branch).toBe(true)
    expect(byId.d.branch).toBe(true)
    expect(nodes.filter((n) => n.user.text === 'next' || n.user.text === '> q').every((n) => !n.branch)).toBe(true)
  })

  it('exports version 2 with kinds; importing a version 1 file derives branches', async () => {
    await db.nodes.update('b', { branch: true, archived: 7 })
    const f = JSON.parse((await exportConversation('c')).json)
    expect(f.version).toBe(2)
    expect(f.nodes.find((n: ChatNode) => n.id === 'b')).toMatchObject({ branch: true, archived: 7 })
    const id2 = await importConversation(JSON.stringify(f))
    expect((await db.nodes.where('conversationId').equals(id2).toArray()).filter((n) => n.archived)).toHaveLength(1)

    const v1 = { ...f, version: 1, nodes: f.nodes.map(({ branch: _b, archived: _a, ...n }: ChatNode) => n) }
    const id1 = await importConversation(JSON.stringify(v1))
    const nodes = await db.nodes.where('conversationId').equals(id1).toArray()
    expect(nodes.filter((n) => n.branch).map((n) => n.user.text).sort()).toEqual(['pic', 'u-b'])

    await expect(importConversation(JSON.stringify({ ...f, nodes: [{ ...f.nodes[0], branch: 'yes' }] }))).rejects.toThrow('bad message')
  })
})

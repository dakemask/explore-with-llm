import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, ROOT_KEY, type ChatNode } from './db'
import { activePath, threadPath } from './lib/tree'
import { setLabel } from './lib/chat'
import { exportConversation, importConversation, REMOVED } from './lib/transfer'

const KEY = 'sk-secret-key-1234567890'

const node = (id: string, parentId: string | null, extra: Partial<ChatNode> = {}): ChatNode => ({
  id,
  conversationId: 'c',
  parentId,
  kind: 'main',
  createdAt: Number(id.replace(/\D/g, '')) || 0,
  user: { text: `q ${id}` },
  assistant: { content: `a ${id}` },
  attempt: {
    status: 'done',
    providerId: 'p',
    providerName: 'P',
    protocol: 'openai-chat',
    model: 'm',
    url: 'http://x/v1/chat/completions',
    requestHeaders: { Authorization: `Bearer ${KEY}`, 'X-Custom': `also ${KEY}`, 'Content-Type': 'application/json' },
    requestBody: { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,[image:img1]' } }] }] },
    rawChunks: [{ t: 1, text: 'data: {}' }],
    startedAt: 0,
    rawText: `a ${id}`,
  },
  ...extra,
})

beforeEach(async () => {
  await Promise.all([db.conversations.clear(), db.nodes.clear(), db.images.clear(), db.providers.clear()])
  await db.providers.add({ id: 'p', name: 'P', protocol: 'openai-chat', baseUrl: 'http://x/v1', apiKey: KEY, models: ['m'], createdAt: 0 })
  await db.conversations.add({ id: 'c', title: 'T', createdAt: 0, updatedAt: 0, selectedChild: { [ROOT_KEY]: 'n1', n1: 'n3', th: 's1' } })
  await db.nodes.bulkAdd([
    node('n1', null, { user: { text: 'look', images: ['img1'] }, system: 'Be brief.' }),
    node('n2', 'n1'),
    node('n3', 'n1', { edit: { from: 'n2', history: [{ content: 'a n2', at: 0 }], at: 1 }, label: '改过的版本' }),
    node('s1', 'n1', { kind: 'side', thread: 'th', anchor: { start: 0, end: 1, text: 'a' } }),
    node('s2', 's1', { kind: 'side', thread: 'th' }),
  ])
  await db.images.add({ id: 'img1', conversationId: 'c', blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/png' }), mime: 'image/png', width: 1, height: 1, createdAt: 0 })
})

describe('conversation export / import', () => {
  it('exports without API keys', async () => {
    const { name, json } = await exportConversation('c')
    expect(name).toMatch(/^T-\d{8}\.json$/)
    expect(json).not.toContain(KEY)
    const f = JSON.parse(json)
    expect(f.nodes[0].attempt.requestHeaders).toEqual({ Authorization: REMOVED, 'X-Custom': `also ${REMOVED}`, 'Content-Type': 'application/json' })
    expect(f.images[0].data).toBe(btoa(String.fromCharCode(1, 2, 3, 250)))
  })

  it('imports as a new, independent copy with the same structure', async () => {
    const { json } = await exportConversation('c')
    const a = await importConversation(json)
    const b = await importConversation(json)
    expect(a).not.toBe(b)
    expect(await db.nodes.count()).toBe(15)

    const conv = (await db.conversations.get(a))!
    const nodes = await db.nodes.where('conversationId').equals(a).toArray()
    expect(nodes.every((n) => !['n1', 'n2', 'n3', 's1', 's2'].includes(n.id))).toBe(true)
    const path = activePath(nodes, conv.selectedChild)
    expect(path.map((n) => n.assistant.content)).toEqual(['a n1', 'a n3'])
    expect(path[1].edit!.from).toBe(nodes.find((n) => n.assistant.content === 'a n2')!.id)
    expect(path.map((n) => n.label)).toEqual([undefined, '改过的版本'])
    expect(path[0].system).toBe('Be brief.')
    const thread = nodes.find((n) => n.anchor)!.thread!
    expect(thread).not.toBe('th')
    expect(threadPath(nodes, thread, conv.selectedChild).map((n) => n.assistant.content)).toEqual(['a s1', 'a s2'])

    const imageId = path[0].user.images![0]
    const img = (await db.images.get(imageId))!
    expect(img.conversationId).toBe(a)
    expect([...new Uint8Array(await img.blob.arrayBuffer())]).toEqual([1, 2, 3, 250])
    expect(JSON.stringify(path[0].attempt.requestBody)).toContain(`[image:${imageId}]`)
    expect(path[0].attempt.rawChunks).toEqual([{ t: 1, text: 'data: {}' }])
  })

  it('exports version 5 and still imports versions 4 (no system messages) and 3 (no labels)', async () => {
    const f = JSON.parse((await exportConversation('c')).json)
    expect(f.version).toBe(6)
    f.version = 4
    for (const n of f.nodes) delete n.system
    const v4 = await importConversation(JSON.stringify(f))
    expect((await db.nodes.where('conversationId').equals(v4).toArray()).some((n) => n.system)).toBe(false)
    f.version = 3
    for (const n of f.nodes) delete n.label
    const id = await importConversation(JSON.stringify(f))
    expect((await db.nodes.where('conversationId').equals(id).toArray()).some((n) => n.label)).toBe(false)
  })

  it('rejects files that are not exported conversations', async () => {
    await expect(importConversation('nope')).rejects.toThrow('not JSON')
    await expect(importConversation('{"a":1}')).rejects.toThrow('not an exported conversation')
    const f = JSON.parse((await exportConversation('c')).json)
    f.nodes[2].label = 42
    await expect(importConversation(JSON.stringify(f))).rejects.toThrow('bad message')
    delete f.nodes[2].label
    f.nodes[0].system = ['x']
    await expect(importConversation(JSON.stringify(f))).rejects.toThrow('bad message')
    delete f.nodes[0].system
    f.nodes[1].parentId = 'missing'
    await expect(importConversation(JSON.stringify(f))).rejects.toThrow('broken message tree')
    expect(await db.conversations.count()).toBe(1)
  })
})

describe('labels', () => {
  it('sets a trimmed label, and an empty one removes it', async () => {
    await setLabel('n1', '  first  ')
    expect((await db.nodes.get('n1'))!.label).toBe('first')
    await setLabel('n1', '   ')
    expect('label' in (await db.nodes.get('n1'))!).toBe(false)
  })
})

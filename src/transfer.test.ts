import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, ROOT_KEY, type ChatNode } from './db'
import { activePath, pathTo, threadPath } from './lib/tree'
import { deleteArchived, deleteConversation, editAssistant, setLabel } from './lib/chat'
import { gunzip, loadResponse, readMerged, readRequest, saveRequest, saveResponse, type PackedRequest } from './lib/records'
import { exportConversation, importConversation, REMOVED } from './lib/transfer'

const KEY = 'sk-secret-key-1234567890'
const HEADERS = { Authorization: `Bearer ${KEY}`, 'X-Custom': `also ${KEY}`, 'Content-Type': 'application/json' }
const LONG = 'a question long enough to be stored as a pointer into the node'

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
    responseSize: 8,
    startedAt: 0,
    rawText: `a ${id}`,
  },
  ...extra,
})

const imageBody = { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,[image:img1]' } }] }] }
/** n2's request: the context (n1, whose question is LONG) and its own question. */
const n2Body = {
  messages: [
    { role: 'user', content: LONG },
    { role: 'assistant', content: 'a n1' },
    { role: 'user', content: 'q n2' },
  ],
}

beforeEach(async () => {
  await Promise.all([db.conversations.clear(), db.nodes.clear(), db.images.clear(), db.providers.clear(), db.requests.clear(), db.responses.clear(), db.merged.clear()])
  await db.providers.add({ id: 'p', name: 'P', protocol: 'openai-chat', baseUrl: 'http://x/v1', apiKey: KEY, models: ['m'], createdAt: 0 })
  await db.conversations.add({ id: 'c', title: 'T', createdAt: 0, updatedAt: 0, selectedChild: { [ROOT_KEY]: 'n1', n1: 'n3', th: 's1' } })
  const nodes = [
    node('n1', null, { user: { text: LONG, images: ['img1'] }, system: 'Be brief.' }),
    node('n2', 'n1'),
    node('n3', 'n1', { edit: { from: 'n2', history: [{ content: 'a n2', at: 0 }], at: 1 }, label: '改过的版本' }),
    node('s1', 'n1', { kind: 'side', thread: 'th', anchor: { start: 0, end: 1, text: 'a' } }),
    node('s2', 's1', { kind: 'side', thread: 'th' }),
  ]
  await db.nodes.bulkAdd(nodes)
  for (const n of nodes) {
    await saveRequest(n, { headers: HEADERS, body: n.id === 'n2' ? n2Body : imageBody }, pathTo(nodes, n.parentId ?? ''))
    await saveResponse(n, [{ t: 1, text: 'data: {}' }], n.attempt)
  }
  await db.images.add({ id: 'img1', conversationId: 'c', blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/png' }), mime: 'image/png', width: 1, height: 1, createdAt: 0 })
})

const decode = async (base64: string) => gunzip(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))

describe('stored records', () => {
  it('stores a request by pointers and gives it back exactly as sent', async () => {
    const row = (await db.requests.get('n2'))!
    const packed = (await gunzip(row.data)) as PackedRequest
    expect(packed.refs).toEqual([[['messages', 0, 'content'], 'n1', 'user']])
    expect(JSON.stringify(packed)).not.toContain(LONG)
    const n2 = (await db.nodes.get('n2'))!
    expect(await readRequest(row, n2)).toEqual({ headers: HEADERS, body: n2Body })
  })

  it('makes only exact copies of a text pointers', async () => {
    const n2 = (await db.nodes.get('n2'))!
    const n1 = (await db.nodes.get('n1'))!
    const body = { a: LONG, b: `${LONG} ` }
    await saveRequest(n2, { body }, [n1])
    const packed = (await gunzip((await db.requests.get('n2'))!.data)) as PackedRequest
    expect(packed.refs).toEqual([[['a'], 'n1', 'user']])
    expect((await readRequest((await db.requests.get('n2'))!, n2)).body).toEqual(body)
  })

  it('stores the merged response by pointers into the attempt, and makes it for older responses when asked', async () => {
    const reply = 'a reply long enough to be stored as a pointer into the attempt'
    const chunks = [
      { t: 1, text: `data: ${JSON.stringify({ id: 'x', choices: [{ index: 0, delta: { content: reply.slice(0, 10) } }] })}\n\n` },
      { t: 2, text: `data: ${JSON.stringify({ id: 'x', choices: [{ index: 0, delta: { content: reply.slice(10) }, finish_reason: 'stop' }] })}\n\n` },
    ]
    const n1 = (await db.nodes.get('n1'))!
    const attempt = { ...n1.attempt, rawText: reply }
    await saveResponse(n1, chunks, attempt)
    expect(JSON.stringify(await gunzip((await db.merged.get('n1'))!.data))).not.toContain(reply)
    const shown = { ...n1, attempt }
    const merged = (await readMerged(shown)) as { choices: { message: { content: string } }[] }
    expect(merged.choices[0].message.content).toBe(reply)
    // A response stored before merged ones existed: made from the raw response, then kept.
    await db.merged.delete('n1')
    expect(await readMerged(shown)).toEqual(merged)
    expect(await db.merged.get('n1')).toBeDefined()
    expect(await readMerged({ ...n1, id: 'none' })).toBeNull()
  })

  it('an edited reply gets a copy of the records; deleting removes them', async () => {
    const n2 = (await db.nodes.get('n2'))!
    const id = await editAssistant(n2, 'edited')
    const copy = (await db.nodes.get(id))!
    expect((await readRequest((await db.requests.get(id))!, copy)).body).toEqual(n2Body)
    expect(await loadResponse(id)).toEqual([{ t: 1, text: 'data: {}' }])
    expect(await db.merged.get(id)).toBeDefined()
    await deleteArchived('c', ['n2', id])
    expect(await db.merged.bulkGet(['n2', id])).toEqual([undefined, undefined])
    expect(await db.requests.bulkGet(['n2', id])).toEqual([undefined, undefined])
    expect(await db.responses.bulkGet(['n2', id])).toEqual([undefined, undefined])
    await deleteConversation('c')
    expect(await db.requests.count()).toBe(0)
    expect(await db.responses.count()).toBe(0)
    expect(await db.merged.count()).toBe(0)
  })
})

describe('conversation export / import', () => {
  it('exports without API keys', async () => {
    const { name, json } = await exportConversation('c')
    expect(name).toMatch(/^T-\d{8}\.json$/)
    expect(json).not.toContain(KEY)
    const f = JSON.parse(json)
    expect(f.version).toBe(7)
    const req = (await decode(f.records[0].request)) as PackedRequest
    expect(JSON.stringify(req)).not.toContain(KEY)
    expect(req.headers).toEqual({ Authorization: REMOVED, 'X-Custom': `also ${REMOVED}`, 'Content-Type': 'application/json' })
    expect(f.images[0].data).toBe(btoa(String.fromCharCode(1, 2, 3, 250)))
  })

  it('imports as a new, independent copy with the same structure', async () => {
    const { json } = await exportConversation('c')
    const a = await importConversation(json)
    const b = await importConversation(json)
    expect(a).not.toBe(b)
    expect(await db.nodes.count()).toBe(15)
    expect(await db.requests.count()).toBe(15)

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
    const req = await readRequest((await db.requests.get(path[0].id))!, path[0])
    expect(JSON.stringify(req.body)).toContain(`[image:${imageId}]`)
    expect(await loadResponse(path[0].id)).toEqual([{ t: 1, text: 'data: {}' }])
    // The pointer now points at the copy's own node.
    const n2 = nodes.find((n) => n.assistant.content === 'a n2')!
    expect((await readRequest((await db.requests.get(n2.id))!, n2)).body).toEqual(n2Body)
  })

  it('imports version 6 (records inside the nodes), 4 (no system messages) and 3 (no labels)', async () => {
    const f = JSON.parse((await exportConversation('c')).json)
    for (const r of f.records) {
      const n = f.nodes.find((x: ChatNode) => x.id === r.node)
      const req = (await decode(r.request)) as PackedRequest
      const full = await readRequest({ id: r.node, conversationId: 'c', data: JSON.stringify(req) }, n)
      Object.assign(n.attempt, { requestHeaders: full.headers, requestBody: full.body, rawChunks: await decode(r.response) })
      delete n.attempt.responseSize
    }
    delete f.records
    f.version = 6
    const v6 = await importConversation(JSON.stringify(f))
    const nodes = await db.nodes.where('conversationId').equals(v6).toArray()
    expect(nodes.every((n) => !('requestBody' in n.attempt) && n.attempt.responseSize === 8)).toBe(true)
    const n2 = nodes.find((n) => n.assistant.content === 'a n2')!
    const row = (await db.requests.get(n2.id))!
    expect(((await gunzip(row.data)) as PackedRequest).refs).toHaveLength(1)
    expect((await readRequest(row, n2)).body).toEqual(n2Body)
    expect(await loadResponse(n2.id)).toEqual([{ t: 1, text: 'data: {}' }])

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
    f.nodes[1].parentId = 'n1'
    f.records[0].request = 'not gzip'
    await expect(importConversation(JSON.stringify(f))).rejects.toThrow('bad record')
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

import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { expect, it } from 'vitest'

const LONG = 'a first question, long enough to become a pointer in the next request'

it('DB v7 moves each request and raw response out of its node, then compresses them', async () => {
  // A database as v6 left it, written before the app's schema is loaded.
  const old = new Dexie('explore-with-llm')
  old.version(6).stores({
    providers: 'id, createdAt',
    conversations: 'id, updatedAt',
    nodes: 'id, conversationId, parentId',
    images: 'id, conversationId',
    notes: 'id, conversationId, nodeId',
  })
  const attempt = (body: unknown, chunks?: unknown) => ({
    status: 'done',
    url: 'http://x',
    requestHeaders: { 'x-api-key': 'k' },
    requestBody: body,
    ...(chunks !== undefined && { rawChunks: chunks }),
    startedAt: 0,
    rawText: '',
  })
  await old.table('nodes').bulkAdd([
    { id: 'a', conversationId: 'c', parentId: null, kind: 'main', user: { text: LONG }, assistant: { content: 'A' }, attempt: attempt({ messages: [LONG] }, [{ t: 1, text: 'data: é' }]) },
    { id: 'b', conversationId: 'c', parentId: 'a', kind: 'main', user: { text: 'q' }, assistant: { content: '' }, attempt: attempt({ messages: [LONG, 'A', 'q'] }) },
  ])
  old.close()

  const { db } = await import('./db')
  const { compressPending, loadResponse, readRequest } = await import('./lib/records')
  await db.open()
  expect(db.verno).toBe(7)
  const [a, b] = await db.nodes.bulkGet(['a', 'b'])
  expect(a!.attempt).not.toHaveProperty('requestBody')
  expect(a!.attempt).not.toHaveProperty('rawChunks')
  expect(a!.attempt.responseSize).toBe(8)
  expect(b!.attempt.responseSize).toBeUndefined()
  expect(await db.requests.where('pending').equals(1).count()).toBe(2)

  await compressPending()
  expect(await db.requests.where('pending').equals(1).count()).toBe(0)
  const row = (await db.requests.get('b'))!
  expect(row.data).toBeInstanceOf(Uint8Array)
  expect(await readRequest(row, b!)).toEqual({ headers: { 'x-api-key': 'k' }, body: { messages: [LONG, 'A', 'q'] } })
  expect(await loadResponse('a')).toEqual([{ t: 1, text: 'data: é' }])
  expect(await db.responses.get('b')).toBeUndefined()
})

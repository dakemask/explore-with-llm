import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { expect, it } from 'vitest'

it('DB v6 adds the notes table and keeps everything else', async () => {
  // A database as v5 left it, written before the app's schema is loaded.
  const old = new Dexie('explore-with-llm')
  old.version(5).stores({
    providers: 'id, createdAt',
    conversations: 'id, updatedAt',
    nodes: 'id, conversationId, parentId',
    images: 'id, conversationId',
  })
  await old.table('conversations').add({ id: 'c', title: 'T', createdAt: 0, updatedAt: 0, selectedChild: {} })
  await old.table('nodes').add({ id: 'a', conversationId: 'c', parentId: null, kind: 'main', branch: true })
  old.close()

  const { db } = await import('./db')
  await db.open()
  expect(db.verno).toBe(8)
  expect(await db.nodes.get('a')).toMatchObject({ branch: true })
  expect(await db.conversations.count()).toBe(1)
  const anchor = { start: 0, end: 1, text: 'x' }
  await db.notes.add({ id: 'n', conversationId: 'c', nodeId: 'a', target: 'user', anchor, text: 'hi', createdAt: 1, updatedAt: 1 })
  expect(await db.notes.where('nodeId').equals('a').count()).toBe(1)
})

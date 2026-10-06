import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { expect, it } from 'vitest'

it('DB v5 makes main nodes with a follow-up or a side question branches', async () => {
  // A database as v4 left it, written before the app's schema is loaded.
  const old = new Dexie('explore-with-llm')
  old.version(4).stores({
    providers: 'id, createdAt',
    conversations: 'id, updatedAt',
    nodes: 'id, conversationId, parentId',
    images: 'id, conversationId',
  })
  const n = (id: string, parentId: string | null, extra = {}) => ({ id, conversationId: 'c', parentId, kind: 'main', ...extra })
  await old.table('nodes').bulkAdd([
    n('a', null),
    n('b', 'a'),
    n('c', 'b'),
    n('x', null),
    n('s', 'x', { kind: 'side', thread: 'T', anchor: { start: 0, end: 1, text: 'a' } }),
    n('s2', 's', { kind: 'side', thread: 'T' }),
  ])
  old.close()

  const { db } = await import('./db')
  await db.open()
  const nodes = await db.nodes.toArray()
  expect(db.verno).toBe(5)
  expect(nodes.filter((n) => n.branch).map((n) => n.id).sort()).toEqual(['a', 'b', 'x'])
})

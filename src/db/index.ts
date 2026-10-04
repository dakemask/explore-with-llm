import Dexie, { type EntityTable } from 'dexie'
import type { ChatNode, Conversation, Provider } from './types'

export const db = new Dexie('explore-with-llm') as Dexie & {
  providers: EntityTable<Provider, 'id'>
  conversations: EntityTable<Conversation, 'id'>
  nodes: EntityTable<ChatNode, 'id'>
}

db.version(1).stores({
  providers: 'id, createdAt',
  conversations: 'id, updatedAt',
  nodes: 'id, conversationId, parentId',
})

/** Requests can't survive a reload; mark anything left streaming as aborted. */
export async function recoverInterruptedNodes() {
  const all = await db.nodes.toArray()
  const stuck = all.filter((n) => n.attempt.status === 'streaming')
  if (stuck.length === 0) return
  await db.nodes.bulkPut(
    stuck.map((n) => ({
      ...n,
      attempt: { ...n.attempt, status: 'aborted' as const, finishedAt: n.attempt.finishedAt ?? Date.now() },
    })),
  )
}

export * from './types'

import Dexie, { type EntityTable } from 'dexie'
import { splitNode } from '../lib/records'
import { deriveBranches } from '../lib/tree'
import type { ChatNode, Conversation, ModelConfig, Note, Provider, StoredImage, StoredRecord } from './types'

export const db = new Dexie('explore-with-llm') as Dexie & {
  providers: EntityTable<Provider, 'id'>
  conversations: EntityTable<Conversation, 'id'>
  nodes: EntityTable<ChatNode, 'id'>
  images: EntityTable<StoredImage, 'id'>
  notes: EntityTable<Note, 'id'>
  requests: EntityTable<StoredRecord, 'id'>
  responses: EntityTable<StoredRecord, 'id'>
  merged: EntityTable<StoredRecord, 'id'>
}

db.version(1).stores({
  providers: 'id, createdAt',
  conversations: 'id, updatedAt',
  nodes: 'id, conversationId, parentId',
})

// v2: echo-back got its own switch; a non-empty field list used to mean "on".
db.version(2)
  .stores({
    providers: 'id, createdAt',
    conversations: 'id, updatedAt',
    nodes: 'id, conversationId, parentId',
  })
  .upgrade((tx) =>
    tx
      .table('providers')
      .toCollection()
      .modify((p: Record<string, any>) => {
        p.echoReasoning = (p.echoFields?.length ?? 0) > 0
      }),
  )

// v3: parameters, echo-back and custom headers became per-model (`modelConfigs`). Provider-wide echo and
// headers used to apply to every model, so each model gets a copy.
db.version(3)
  .stores({
    providers: 'id, createdAt',
    conversations: 'id, updatedAt',
    nodes: 'id, conversationId, parentId',
  })
  .upgrade((tx) =>
    tx
      .table('providers')
      .toCollection()
      .modify((p: Provider & Record<string, any>) => {
        const configs: Record<string, ModelConfig> = {}
        for (const m of p.models) {
          const c: ModelConfig = {}
          if (p.modelParams?.[m]?.trim()) c.params = p.modelParams[m]
          if (p.echoReasoning) c.echoReasoning = true
          if (p.echoFields?.length) c.echoFields = p.echoFields
          if (p.headers?.trim()) c.headers = p.headers
          if (Object.keys(c).length) configs[m] = c
        }
        p.modelConfigs = configs
        delete p.modelParams
        delete p.echoReasoning
        delete p.echoFields
        delete p.headers
      }),
  )

// v4: images attached to user messages.
db.version(4).stores({
  providers: 'id, createdAt',
  conversations: 'id, updatedAt',
  nodes: 'id, conversationId, parentId',
  images: 'id, conversationId',
})

// v5: node kinds. Main nodes that already have a follow-up or a side question become branches.
db.version(5)
  .stores({
    providers: 'id, createdAt',
    conversations: 'id, updatedAt',
    nodes: 'id, conversationId, parentId',
    images: 'id, conversationId',
  })
  .upgrade(async (tx) => {
    const nodes = (await tx.table('nodes').toArray()) as ChatNode[]
    const changed = deriveBranches(nodes).filter((n, i) => n !== nodes[i])
    if (changed.length) await tx.table('nodes').bulkPut(changed)
  })

// v6: notes on passages of main-line messages.
db.version(6).stores({
  providers: 'id, createdAt',
  conversations: 'id, updatedAt',
  nodes: 'id, conversationId, parentId',
  images: 'id, conversationId',
  notes: 'id, conversationId, nodeId',
})

// v7: each node's request and raw response move to tables of their own (`lib/records.ts`), so reading a
// conversation doesn't read them. Stored as plain JSON here (`pending`) and compressed after startup: the
// upgrade can't await the browser's compression without its transaction ending.
db.version(7)
  .stores({
    providers: 'id, createdAt',
    conversations: 'id, updatedAt',
    nodes: 'id, conversationId, parentId',
    images: 'id, conversationId',
    notes: 'id, conversationId, nodeId',
    requests: 'id, conversationId, pending',
    responses: 'id, conversationId, pending',
  })
  .upgrade(async (tx) => {
    const nodes = (await tx.table('nodes').toArray()) as ChatNode[]
    const requests: StoredRecord[] = []
    const responses: StoredRecord[] = []
    const slim: ChatNode[] = []
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const pathOf = (n: ChatNode) => {
      const path: ChatNode[] = []
      for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) path.unshift(p)
      return path
    }
    for (const n of nodes) {
      if (!n.attempt) continue
      const parts = splitNode(n, pathOf(n))
      slim.push(parts.node)
      const row = (v: unknown): StoredRecord => ({ id: n.id, conversationId: n.conversationId, data: JSON.stringify(v), pending: 1 })
      if (parts.request) requests.push(row(parts.request))
      if (parts.chunks) responses.push(row(parts.chunks))
    }
    await tx.table('requests').bulkPut(requests)
    await tx.table('responses').bulkPut(responses)
    await tx.table('nodes').bulkPut(slim)
  })

// v8: each raw response's merged form, shown in the detail dialog (`lib/records.ts`). Ones from before are made
// when first shown.
db.version(8).stores({
  providers: 'id, createdAt',
  conversations: 'id, updatedAt',
  nodes: 'id, conversationId, parentId',
  images: 'id, conversationId',
  notes: 'id, conversationId, nodeId',
  requests: 'id, conversationId, pending',
  responses: 'id, conversationId, pending',
  merged: 'id, conversationId',
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

/** A new note left empty when the app closed (its card would have deleted it). */
export async function dropEmptyNotes() {
  const empty = await db.notes.filter((n) => !n.text.trim() && !n.title?.trim()).primaryKeys()
  if (empty.length) await db.notes.bulkDelete(empty)
}

export * from './types'

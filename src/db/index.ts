import Dexie, { type EntityTable } from 'dexie'
import type { ChatNode, Conversation, ModelConfig, Provider } from './types'

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

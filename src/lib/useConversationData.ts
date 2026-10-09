import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef } from 'react'
import { db, type ChatNode, type Conversation, type Note } from '../db'
import { useUi } from '../store/ui'

export interface ConversationData {
  conversation: Conversation | undefined
  nodes: ChatNode[]
  notes: Note[]
}

/**
 * A conversation with its nodes and notes, read in one transaction so they always come from the same moment.
 * `undefined` while loading — including right after switching, when the live query still holds the previous
 * conversation's data: showing nothing for a frame beats mixing one conversation's remembered selections
 * with another's nodes (which flashed wrong branches, dots and colors). The chat reads its data only here.
 *
 * Fork selections just made (`useUi().picked`) are laid over the stored ones, so a switch shows at once,
 * not after its write and the re-read; they're forgotten once a read has them.
 *
 * Every write re-reads all three; what didn't change keeps its previous object — the conversation, the notes,
 * each node, and the nodes' array when no node changed —, so a write (a streamed reply's, a switch's) doesn't
 * re-render (and rebuild the highlights of) everything that uses them.
 */
export function useConversationData(id: string | null): ConversationData | undefined {
  const data = useLiveQuery(
    async () => {
      if (!id) return { id, conversation: undefined, nodes: [], notes: [] }
      return db.transaction('r', db.conversations, db.nodes, db.notes, async () => ({
        id,
        conversation: await db.conversations.get(id),
        nodes: await db.nodes.where('conversationId').equals(id).toArray(),
        notes: await db.notes.where('conversationId').equals(id).sortBy('createdAt'),
      }))
    },
    [id],
  )
  const picked = useUi((s) => (s.picked?.conversationId === id ? s.picked.selection : null))
  const stored = data?.id === id ? data.conversation?.selectedChild : undefined
  useEffect(() => {
    if (id && stored) useUi.getState().settlePicks(id, stored)
  }, [id, stored])

  const prev = useRef<ConversationData | undefined>(undefined)
  return useMemo(() => {
    if (!data || data.id !== id) return undefined
    const same = <T,>(a: T, b: T | undefined) => (b !== undefined && JSON.stringify(a) === JSON.stringify(b) ? b : a)
    let conversation = data.conversation
    if (conversation && picked) conversation = { ...conversation, selectedChild: { ...conversation.selectedChild, ...picked } }
    const next: ConversationData = {
      conversation: same(conversation, prev.current?.conversation),
      nodes: sameNodes(data.nodes, prev.current?.nodes),
      notes: same(data.notes, prev.current?.notes),
    }
    prev.current = next
    return next
  }, [data, id, picked])
}

/**
 * The new nodes, keeping each unchanged one's previous object (and the previous array if none changed). A
 * node's `attempt` (can be large: the native reply, encrypted reasoning included) is compared by what every write of it changes —
 * `status`, `url` (the request is recorded), `finishedAt` (it ended) —; a new kind of attempt write must
 * change one of them too.
 */
function sameNodes(nodes: ChatNode[], before: ChatNode[] | undefined): ChatNode[] {
  if (!before) return nodes
  const byId = new Map(before.map((n) => [n.id, n]))
  const key = (n: ChatNode) => JSON.stringify({ ...n, attempt: [n.attempt.status, n.attempt.url, n.attempt.finishedAt] })
  let changed = nodes.length !== before.length
  const next = nodes.map((n, i) => {
    const old = byId.get(n.id)
    const kept = old && key(old) === key(n) ? old : n
    changed ||= kept !== before[i]
    return kept
  })
  return changed ? next : before
}

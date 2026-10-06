import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef } from 'react'
import { db, type ChatNode, type Conversation, type Note } from '../db'

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
 * Every write re-reads all three; the conversation and the notes keep their previous objects when unchanged,
 * so a streamed reply's write doesn't re-render (and rebuild the highlights of) everything that uses them.
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
  const prev = useRef<ConversationData | undefined>(undefined)
  return useMemo(() => {
    if (!data || data.id !== id) return undefined
    const same = <T,>(a: T, b: T | undefined) => (b !== undefined && JSON.stringify(a) === JSON.stringify(b) ? b : a)
    const next: ConversationData = {
      conversation: same(data.conversation, prev.current?.conversation),
      nodes: data.nodes,
      notes: same(data.notes, prev.current?.notes),
    }
    prev.current = next
    return next
  }, [data, id])
}

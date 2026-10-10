import { ROOT_KEY, type ChatNode, type Conversation, type Note, type SideAnchor } from '../db/types'

const byTime = (a: ChatNode, b: ChatNode) => a.createdAt - b.createdAt

export function childrenOf(nodes: ChatNode[], parentId: string | null, kind: ChatNode['kind'] = 'main') {
  return nodes.filter((n) => n.parentId === parentId && n.kind === kind && !n.anchor && !n.archived).sort(byTime)
}

/**
 * The branches among `kids` (a fork's children, oldest first), in the order they became branches (`branchAt`,
 * else `createdAt`): the switcher's dots, the tree map's rows and the colors' order. Attempts stay oldest first.
 */
export function branchesOf(kids: ChatNode[]) {
  return kids.filter((n) => n.branch).sort((a, b) => (a.branchAt ?? a.createdAt) - (b.branchAt ?? b.createdAt))
}

/** Versions of a side question's first message (all roots of `thread`, unless archived), oldest first. */
export function threadRoots(nodes: ChatNode[], thread: string) {
  return nodes.filter((n) => n.thread === thread && n.anchor && !n.archived).sort(byTime)
}

/**
 * Key in `Conversation.selectedChild` for the fork `node` sits at: its parent, ROOT_KEY at the top,
 * or the thread id for side-question roots (several threads hang off the same main node).
 */
export function forkKey(node: ChatNode): string {
  if (node.anchor && node.thread) return node.thread
  return node.parentId ?? ROOT_KEY
}

/** Follows remembered selections (or the newest child) down from the first fork. */
function follow(nodes: ChatNode[], first: ChatNode[], selectedChild: Conversation['selectedChild']) {
  const path: ChatNode[] = []
  let kids = first
  while (kids.length > 0) {
    const wanted: string | undefined = selectedChild[forkKey(kids[0])]
    const next: ChatNode = kids.find((k) => k.id === wanted) ?? kids[kids.length - 1]
    path.push(next)
    kids = childrenOf(nodes, next.id, next.kind)
  }
  return path
}

/**
 * The main-line path currently shown: start at the root, and at each fork follow
 * the remembered child (or the newest one if nothing is remembered).
 */
export function activePath(nodes: ChatNode[], selectedChild: Conversation['selectedChild']): ChatNode[] {
  return follow(nodes, childrenOf(nodes, null), selectedChild)
}

/** The side-question thread as currently shown, from its root version down. */
export function threadPath(nodes: ChatNode[], thread: string, selectedChild: Conversation['selectedChild']) {
  return follow(nodes, threadRoots(nodes, thread), selectedChild)
}

/** Side-question threads asked from `nodeId`, oldest first, with their anchor and roots. */
export function sideThreads(nodes: ChatNode[], nodeId: string) {
  const threads = new Map<string, { thread: string; anchor: SideAnchor; roots: ChatNode[] }>()
  for (const n of nodes.filter((n) => n.parentId === nodeId && n.anchor && n.thread && !n.archived).sort(byTime)) {
    const t = threads.get(n.thread!)
    if (t) t.roots.push(n)
    else threads.set(n.thread!, { thread: n.thread!, anchor: n.anchor!, roots: [n] })
  }
  return [...threads.values()]
}

/** Ancestors from the root down to and including `nodeId` (for side nodes: through the main node asked from). */
export function pathTo(nodes: ChatNode[], nodeId: string): ChatNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const path: ChatNode[] = []
  let cur = byId.get(nodeId)
  while (cur) {
    path.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return path
}

/** All versions of a node at its fork (including itself), oldest first. */
export function siblingsOf(nodes: ChatNode[], node: ChatNode): ChatNode[] {
  if (node.anchor && node.thread) return threadRoots(nodes, node.thread).filter((n) => n.parentId === node.parentId)
  return childrenOf(nodes, node.parentId, node.kind)
}

// ---- Node kinds and the archive ----
// Archived nodes (and everything below them) are skipped by the helpers above.

/** Whether `nodeId` is hidden: it or anything above it (for side nodes: up through the main node asked from) is archived. */
export function isHidden(nodes: ChatNode[], nodeId: string): boolean {
  return pathTo(nodes, nodeId).some((n) => n.archived)
}

/**
 * The branch rule for data from before node kinds: a main node with a main child or a side question is a
 * branch. Returns the list with those nodes replaced by copies (others are the same objects).
 */
export function deriveBranches(nodes: ChatNode[]): ChatNode[] {
  const parents = new Set(nodes.filter((n) => n.parentId && (n.kind === 'main' || n.anchor)).map((n) => n.parentId))
  return nodes.map((n) => (n.kind === 'main' && !n.branch && parents.has(n.id) ? { ...n, branch: true as const } : n))
}

/** `rootIds` and every node below them (any kind, archived or not). */
export function subtreeIds(nodes: ChatNode[], rootIds: string[]): Set<string> {
  const kids = new Map<string, string[]>()
  for (const n of nodes) if (n.parentId) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n.id])
  const ids = new Set<string>()
  const stack = [...rootIds]
  while (stack.length) {
    const id = stack.pop()!
    if (ids.has(id)) continue
    ids.add(id)
    stack.push(...(kids.get(id) ?? []))
  }
  return ids
}

/** Nodes with a reply streaming in themselves or below them (archiving those is not allowed). */
export function busyIds(nodes: ChatNode[]): Set<string> {
  const ids = new Set<string>()
  for (const n of nodes) if (n.attempt.status === 'streaming') for (const a of pathTo(nodes, n.id)) ids.add(a.id)
  return ids
}

/** One archive entry: an archived main node, a whole side-question thread, or a note. */
export interface ArchivedItem {
  /** The node id, the thread id, or the note id. */
  key: string
  kind: 'attempt' | 'branch' | 'side' | 'note'
  /** The archived node, or every root version of the thread (oldest first); empty for a note. */
  nodes: ChatNode[]
  /** Notes only. */
  note?: Note
  archived: number
  /** The node it hangs off (side threads: the main node asked from; notes: the node they're on); null at the top. */
  parentId: string | null
  /** Something above it is archived too, so it can't be restored before that is. */
  blocked: boolean
  /** Nodes it holds, itself included (everything that deleting it deletes); 0 for a note. */
  size: number
}

/** Everything archived in a conversation (`notes`: its notes), newest archive first. */
export function archivedItems(nodes: ChatNode[], notes: Note[] = []): ArchivedItem[] {
  const items: ArchivedItem[] = []
  const threads = new Map<string, ChatNode[]>()
  for (const n of nodes.filter((n) => n.archived).sort(byTime)) {
    if (n.anchor && n.thread) threads.set(n.thread, [...(threads.get(n.thread) ?? []), n])
    else if (n.kind === 'main') items.push(item(nodes, n.id, n.branch ? 'branch' : 'attempt', [n]))
  }
  for (const [thread, roots] of threads) items.push(item(nodes, thread, 'side', roots))
  for (const note of notes)
    if (note.archived)
      items.push({
        key: note.id,
        kind: 'note',
        nodes: [],
        note,
        archived: note.archived,
        parentId: note.nodeId,
        blocked: isHidden(nodes, note.nodeId),
        size: 0,
      })
  return items.sort((a, b) => b.archived - a.archived)
}

function item(nodes: ChatNode[], key: string, kind: ArchivedItem['kind'], list: ChatNode[]): ArchivedItem {
  const parentId = list[0].parentId
  return {
    key,
    kind,
    nodes: list,
    archived: Math.max(...list.map((n) => n.archived ?? 0)),
    parentId,
    blocked: !!parentId && isHidden(nodes, parentId),
    size: subtreeIds(nodes, list.map((n) => n.id)).size,
  }
}

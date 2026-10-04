import { ROOT_KEY, type ChatNode, type Conversation, type SideAnchor } from '../db/types'

const byTime = (a: ChatNode, b: ChatNode) => a.createdAt - b.createdAt

export function childrenOf(nodes: ChatNode[], parentId: string | null, kind: ChatNode['kind'] = 'main') {
  return nodes.filter((n) => n.parentId === parentId && n.kind === kind && !n.anchor).sort(byTime)
}

/** Versions of a side question's first message (all roots of `thread`), oldest first. */
export function threadRoots(nodes: ChatNode[], thread: string) {
  return nodes.filter((n) => n.thread === thread && n.anchor).sort(byTime)
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
  for (const n of nodes.filter((n) => n.parentId === nodeId && n.anchor && n.thread).sort(byTime)) {
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

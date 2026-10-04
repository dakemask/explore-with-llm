import { ROOT_KEY, type ChatNode, type Conversation } from '../db/types'

export function childrenOf(nodes: ChatNode[], parentId: string | null, kind: ChatNode['kind'] = 'main') {
  return nodes
    .filter((n) => n.parentId === parentId && n.kind === kind)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * The main-line path currently shown: start at the root, and at each fork follow
 * the remembered child (or the newest one if nothing is remembered).
 */
export function activePath(nodes: ChatNode[], selectedChild: Conversation['selectedChild']): ChatNode[] {
  const path: ChatNode[] = []
  let parentId: string | null = null
  for (;;) {
    const kids = childrenOf(nodes, parentId)
    if (kids.length === 0) return path
    const wanted: string | undefined = selectedChild[parentId ?? ROOT_KEY]
    const next: ChatNode = kids.find((k) => k.id === wanted) ?? kids[kids.length - 1]
    path.push(next)
    parentId = next.id
  }
}

/** Ancestors from the root down to and including `nodeId`. */
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
  return childrenOf(nodes, node.parentId, node.kind)
}

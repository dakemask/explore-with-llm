import type { ChatNode } from '../db/types'
import { childrenOf } from './tree'

/**
 * Branch colors ("rainbow flow", see `docs/tree-preview.html`): 7 colors on a ring (red, orange, yellow, green,
 * cyan, blue, violet; CSS `--branch-0` … `--branch-6`), plus grey for attempts that have siblings.
 * Colors change only below forks (≥ 2 branches): there the branches take the next colors along the ring in
 * creation order (first = parent + 1, …). A branch not at a fork and a lone attempt keep the parent's color.
 * Archived nodes don't count (they are skipped by `childrenOf`).
 */
export const BRANCH_COLORS = 7
export const GREY = -1

/** Color index (0–6, or GREY) of every non-archived main node; the walk starts from red above the top. */
export function branchColors(nodes: ChatNode[]): Map<string, number> {
  const colors = new Map<string, number>()
  const walk = (parentId: string | null, parentColor: number) => {
    const kids = childrenOf(nodes, parentId)
    const fork = kids.filter((n) => n.branch).length >= 2
    let step = 0
    for (const n of kids) {
      const c = !n.branch
        ? kids.length > 1
          ? GREY
          : parentColor
        : fork
          ? (parentColor + ++step) % BRANCH_COLORS
          : parentColor
      colors.set(n.id, c)
      walk(n.id, c)
    }
  }
  walk(null, 0)
  return colors
}

/** The color of the turn above `node` (red at the top), i.e. where its line comes from. */
export function parentColor(colors: Map<string, number>, node: ChatNode): number {
  return node.parentId ? (colors.get(node.parentId) ?? 0) : 0
}

/** The CSS value for a color index. */
export function colorVar(c: number): string {
  return c === GREY ? 'var(--branch-grey)' : `var(--branch-${c})`
}

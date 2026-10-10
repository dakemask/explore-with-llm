import type { ChatNode } from '../db/types'
import { branchesOf, childrenOf } from './tree'

/**
 * Branch colors ("rainbow flow"; rules in CLAUDE.md › Product decisions): 7 colors on a ring (red, orange, yellow, green,
 * cyan, blue, violet; CSS `--branch-0` … `--branch-6`), plus grey for attempts.
 * Colors change only below forks (≥ 2 branches): there the branches take the next colors along the ring in
 * the order they became branches (`branchesOf`; first = parent + 1, …). A branch not at a fork keeps the parent's color. Attempts are always
 * grey, a lone one too (owner, 2026-10-07; it was the parent's color, which made a fresh reply look settled).
 * Archived nodes don't count (they are skipped by `childrenOf`).
 */
export const BRANCH_COLORS = 7
export const GREY = -1

/** Color index (0–6, or GREY) of every non-archived main node; the walk starts from red above the top. */
export function branchColors(nodes: ChatNode[]): Map<string, number> {
  const colors = new Map<string, number>()
  const walk = (parentId: string | null, parentColor: number) => {
    const kids = childrenOf(nodes, parentId)
    const branches = branchesOf(kids)
    const fork = branches.length >= 2
    for (const n of kids) {
      const c = !n.branch ? GREY : fork ? (parentColor + 1 + branches.indexOf(n)) % BRANCH_COLORS : parentColor
      colors.set(n.id, c)
      walk(n.id, c)
    }
  }
  walk(null, 0)
  return colors
}

/** The CSS value for a color index. */
export function colorVar(c: number): string {
  return c === GREY ? 'var(--branch-grey)' : `var(--branch-${c})`
}

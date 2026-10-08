import { ROOT_KEY, type ChatNode, type Conversation } from '../db/types'
import { childrenOf, forkKey, pathTo } from './tree'

/**
 * The tree map of a conversation's main line. What it draws are *units*:
 * every branch is one; a fork's attempts are drawn only where its children are all attempts, then stacked
 * into one unit (a single child, attempt or branch, is a plain unit); attempts beside branches aren't drawn.
 * Archived nodes and side questions never appear (`childrenOf` skips them).
 */
export interface MapUnit {
  /** The node id, or `stack:` + the fork key for a stack. */
  id: string
  type: 'node' | 'stack'
  /** The node, or the stacked attempts (oldest first). */
  nodes: ChatNode[]
  /** The parent unit (always a plain node unit, so this is the parent node id); null at the top. */
  parent: string | null
  /** Column = depth (turn number - 1). */
  col: number
  /** Row from 0 at the top; may be a half (a parent centered between an even spread of children). */
  row: number
}

export interface TreeLayout {
  /** Parents before their children. */
  units: MapUnit[]
  byId: Map<string, MapUnit>
  /** Node id → the unit drawing it (stack members map to their stack). */
  unitOf: Map<string, string>
  maxCol: number
  maxRow: number
}

interface Draft {
  unit: MapUnit
  children: Draft[]
  /** Row relative to the parent while laying out. */
  rel: number
}

function unitsOf(nodes: ChatNode[], parentId: string | null): MapUnit[] {
  const kids = childrenOf(nodes, parentId)
  const branches = kids.filter((n) => n.branch)
  const unit = (n: ChatNode): MapUnit => ({ id: n.id, type: 'node', nodes: [n], parent: parentId, col: 0, row: 0 })
  if (branches.length) return branches.map(unit)
  if (kids.length === 1) return [unit(kids[0])]
  if (kids.length > 1) {
    return [{ id: 'stack:' + (parentId ?? ROOT_KEY), type: 'stack', nodes: kids, parent: parentId, col: 0, row: 0 }]
  }
  return []
}

/**
 * Tidy layout: each subtree is laid out on its own and described by its contour (for every column, the
 * highest and lowest row it uses). Siblings stack top to bottom, each pushed down just enough to clear the
 * ones above by a row, and the parent sits halfway between its first and last child.
 */
function tidy(nodes: ChatNode[], d: Draft): { top: number[]; bot: number[] } {
  d.children = d.unit.type === 'node' ? unitsOf(nodes, d.unit.id).map((unit) => ({ unit, children: [], rel: 0 })) : []
  const ch = d.children
  if (!ch.length) return { top: [0], bot: [0] }
  const accTop: number[] = []
  const accBot: number[] = []
  ch.forEach((c, i) => {
    const s = tidy(nodes, c)
    let shift = 0
    if (i > 0) {
      shift = -Infinity
      for (let k = 0; k < s.top.length && k < accBot.length; k++) shift = Math.max(shift, accBot[k] - s.top[k] + 1)
    }
    c.rel = shift
    for (let k = 0; k < s.top.length; k++) {
      accTop[k] = Math.min(accTop[k] ?? Infinity, s.top[k] + shift)
      accBot[k] = Math.max(accBot[k] ?? -Infinity, s.bot[k] + shift)
    }
  })
  const mid = (ch[0].rel + ch[ch.length - 1].rel) / 2
  for (const c of ch) c.rel -= mid
  return { top: [0, ...accTop.map((v) => v - mid)], bot: [0, ...accBot.map((v) => v - mid)] }
}

/** Lays out the whole main line; several top-level units stack below each other. */
export function layoutTree(nodes: ChatNode[]): TreeLayout {
  const units: MapUnit[] = []
  const place = (d: Draft, col: number, row: number) => {
    d.unit.col = col
    d.unit.row = row
    units.push(d.unit)
    for (const c of d.children) place(c, col + 1, row + c.rel)
  }
  let base = 0
  for (const unit of unitsOf(nodes, null)) {
    const d: Draft = { unit, children: [], rel: 0 }
    const s = tidy(nodes, d)
    const top = Math.min(...s.top)
    place(d, 0, base - top)
    base += Math.max(...s.bot) - top + 1
  }
  const byId = new Map(units.map((u) => [u.id, u]))
  const unitOf = new Map<string, string>()
  for (const u of units) for (const n of u.nodes) unitOf.set(n.id, u.id)
  return {
    units,
    byId,
    unitOf,
    maxCol: Math.max(0, ...units.map((u) => u.col)),
    maxRow: Math.max(0, ...units.map((u) => u.row)),
  }
}

/**
 * Keys that keep a drawn unit the same element across relayouts, for animating changes: a unit takes the
 * key of the unit that drew one of its nodes before (a lone attempt becoming a stack, a stack becoming the
 * branch that was followed up), else its own id. `prev` = node id → key from the last call; returns unit
 * id → key and the node id → key map for the next call.
 */
export function carryKeys(prev: Map<string, string>, layout: TreeLayout) {
  const byUnit = new Map<string, string>()
  const used = new Set<string>()
  // Branch / node units first: a stack whose attempt became a branch hands its key to that branch.
  const order = [...layout.units].sort((a, b) => (a.type === b.type ? 0 : a.type === 'node' ? -1 : 1))
  for (const u of order) {
    let key = u.nodes.map((n) => prev.get(n.id)).find((k) => k !== undefined && !used.has(k))
    if (key === undefined) {
      key = u.id
      for (let i = 2; used.has(key); i++) key = `${u.id}#${i}`
    }
    used.add(key)
    byUnit.set(u.id, key)
  }
  const byNode = new Map<string, string>()
  for (const u of layout.units) for (const n of u.nodes) byNode.set(n.id, byUnit.get(u.id)!)
  return { byUnit, byNode }
}

/**
 * The tree map's "current" turn while the chat scrolls (owner, 2026-10-08): the turn crossing a *reading
 * line* a third of the way down the visible chat (`top`–`bottom`, screen px; the input box's cover left
 * out). Within a screen of either end the line slides toward that edge (top: scrolled to the top, bottom:
 * scrolled to the end — also when nothing scrolls), so the first and the last turn, however short, get
 * their turn. `turnTops` = each turn's top on screen, in order; returns the index of the turn (the last one
 * starting at or above the line; the first if none does).
 */
export function readingTurn(turnTops: number[], view: { top: number; bottom: number; scrollTop: number; maxScroll: number }) {
  const { top, bottom, scrollTop, maxScroll } = view
  const screen = Math.max(1, bottom - top)
  const base = top + screen / 3
  const fromTop = Math.min(1, scrollTop / screen)
  const fromEnd = Math.min(1, Math.max(0, maxScroll - scrollTop) / screen)
  const nearTop = top + (base - top) * fromTop
  // (`- 1`: the line stays on screen, inside the last turn when scrolled to the end.)
  const line = bottom - 1 + (nearTop - (bottom - 1)) * fromEnd
  let at = 0
  turnTops.forEach((t, i) => {
    if (t <= line) at = i
  })
  return at
}

/** Unit ids from the top down to `unitId`. */
export function routeTo(layout: TreeLayout, unitId: string): string[] {
  const ids: string[] = []
  for (let u = layout.byId.get(unitId); u; u = u.parent ? layout.byId.get(u.parent) : undefined) ids.unshift(u.id)
  return ids
}

/** The unit to mark "current" for `nodeId`: its own, or that of its nearest drawn ancestor. */
export function currentUnit(layout: TreeLayout, nodes: ChatNode[], nodeId: string | undefined): string | null {
  if (!nodeId) return null
  for (const n of pathTo(nodes, nodeId).reverse()) {
    const id = layout.unitOf.get(n.id)
    if (id) return id
  }
  return null
}

/**
 * What jumping to a unit does: the node to show (for a stack: the attempt already remembered at that
 * fork if it's one of the stack, else the newest) and the remembered selection at every fork from the
 * top down to it, so the active path goes through it.
 */
export function jumpSelection(nodes: ChatNode[], unit: MapUnit, selectedChild: Conversation['selectedChild']) {
  const remembered = selectedChild[forkKey(unit.nodes[0])]
  const target =
    unit.type === 'stack' ? (unit.nodes.find((n) => n.id === remembered) ?? unit.nodes[unit.nodes.length - 1]) : unit.nodes[0]
  const selection: Record<string, string> = {}
  for (const n of pathTo(nodes, target.id)) selection[forkKey(n)] = n.id
  return { target, selection }
}

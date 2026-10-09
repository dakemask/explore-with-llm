import { describe, expect, it } from 'vitest'
import { ROOT_KEY, type ChatNode } from './db'
import { carryKeys, currentUnit, jumpSelection, layoutTree, routeTo, type TreeLayout } from './lib/treeMap'

let clock = 0
function node(id: string, parentId: string | null, extra: Partial<ChatNode> = {}): ChatNode {
  return {
    id,
    conversationId: 'c',
    parentId,
    kind: 'main',
    createdAt: ++clock,
    user: { text: id },
    assistant: { content: id },
    attempt: {
      status: 'done',
      providerId: 'p',
      providerName: 'P',
      protocol: 'openai-chat',
      model: 'm',
      url: '',
      startedAt: 0,
      rawText: '',
    },
    ...extra,
  }
}
const br = (id: string, parentId: string | null, extra: Partial<ChatNode> = {}) => node(id, parentId, { branch: true, ...extra })

const pos = (l: TreeLayout, id: string) => {
  const u = l.byId.get(id)!
  return [u.col, u.row]
}

describe('tree map layout', () => {
  it('lays a chain out in one row', () => {
    const l = layoutTree([br('a', null), br('b', 'a'), node('c', 'b')], 'c')
    expect(l.units.map((u) => [u.id, u.col, u.row])).toEqual([
      ['a', 0, 0],
      ['b', 1, 0],
      ['c', 2, 0],
    ])
    expect(l.maxCol).toBe(2)
    expect(l.maxRow).toBe(0)
  })

  it('centers a parent between its first and last child', () => {
    const l = layoutTree([br('a', null), br('x', 'a'), br('y', 'a'), br('z', 'a')])
    expect(pos(l, 'x')).toEqual([1, 0])
    expect(pos(l, 'y')).toEqual([1, 1])
    expect(pos(l, 'z')).toEqual([1, 2])
    expect(pos(l, 'a')).toEqual([0, 1])
    const two = layoutTree([br('a', null), br('x', 'a'), br('y', 'a')])
    expect(pos(two, 'a')).toEqual([0, 0.5])
  })

  it('packs subtrees by contour without overlapping', () => {
    // x has a deep fork, y is a single node: y fits right under x's column even though x's subtree is tall below.
    const nodes = [br('a', null), br('x', 'a'), br('x1', 'x'), br('x2', 'x'), br('x2a', 'x2'), br('x2b', 'x2'), br('y', 'a')]
    const l = layoutTree(nodes)
    const seen = new Set<string>()
    for (const u of l.units) {
      const key = `${u.col}:${u.row}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    // Siblings keep their order top to bottom and stay at least a row apart in every column.
    for (const u of l.units) {
      const sibs = l.units.filter((s) => s.parent === u.parent && s.col === u.col)
      for (let i = 1; i < sibs.length; i++) expect(sibs[i].row - sibs[i - 1].row).toBeGreaterThanOrEqual(1)
    }
    const byCol = new Map<number, number[]>()
    for (const u of l.units) byCol.set(u.col, [...(byCol.get(u.col) ?? []), u.row])
    for (const rows of byCol.values()) {
      const sorted = [...rows].sort((p, q) => p - q)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(1)
    }
    // Contour packing: y sits one row below x's lowest row in column 1, not below the whole subtree.
    expect(pos(l, 'y')[1] - pos(l, 'x')[1]).toBe(1)
  })

  it('stacks several attempts at the fork the chat ends at', () => {
    const l = layoutTree([br('a', null), node('t1', 'a'), node('t2', 'a'), node('t3', 'a')], 't2')
    const stack = l.byId.get('stack:a')!
    expect(stack.type).toBe('stack')
    expect(stack.nodes.map((n) => n.id)).toEqual(['t1', 't2', 't3'])
    expect(l.unitOf.get('t2')).toBe('stack:a')
    expect(l.units).toHaveLength(2)
    // A single attempt is a plain unit.
    expect(layoutTree([br('a', null), node('t', 'a')], 't').byId.get('t')?.type).toBe('node')
    // Attempts at the top stack under the root key.
    expect(layoutTree([node('p', null), node('q', null)], 'q').byId.has('stack:' + ROOT_KEY)).toBe(true)
  })

  it('draws attempts only while the chat ends at one of them (also at the end of a line)', () => {
    const nodes = [br('a', null), br('b', 'a'), node('t', 'a'), node('u', 'a'), br('c', 'b'), node('e', 'c')]
    expect([...layoutTree(nodes, 'e').byId.keys()]).toEqual(['a', 'b', 'c', 'e'])
    expect([...layoutTree(nodes, 'c').byId.keys()]).toEqual(['a', 'b', 'c'])
    expect([...layoutTree(nodes).byId.keys()]).toEqual(['a', 'b', 'c'])
    // Beside a branch: after it (the switcher's order), stacked when several.
    const l = layoutTree(nodes, 'u')
    expect([...l.byId.keys()]).toEqual(['a', 'b', 'c', 'stack:a'])
    expect(l.byId.get('stack:a')!.nodes.map((n) => n.id)).toEqual(['t', 'u'])
    expect(pos(l, 'b')).toEqual([1, 0])
    expect(pos(l, 'stack:a')).toEqual([1, 1])
  })

  it('leaves out archived subtrees and side questions', () => {
    const nodes = [
      br('a', null),
      br('b', 'a'),
      br('c', 'a', { archived: 1 }),
      br('c1', 'c'),
      node('s', 'b', { kind: 'side', thread: 'th', anchor: { start: 0, end: 1, text: 'b' } }),
    ]
    const l = layoutTree(nodes)
    expect([...l.byId.keys()]).toEqual(['a', 'b'])
    expect(pos(l, 'a')).toEqual([0, 0])
  })

  it('stacks several top-level units below each other', () => {
    const l = layoutTree([br('a', null), br('a1', 'a'), br('a2', 'a'), br('b', null)])
    expect(pos(l, 'a')).toEqual([0, 0.5])
    expect(pos(l, 'b')).toEqual([0, 2])
    expect(l.maxRow).toBe(2)
  })
})

describe('tree map current marker and jumps', () => {
  const nodes = [br('a', null), br('b', 'a'), node('t', 'a'), br('c', 'b'), node('r1', 'c'), node('r2', 'c')]
  const l = layoutTree(nodes, 'r1')

  it('marks the node itself, its stack, or the nearest drawn ancestor', () => {
    expect(currentUnit(l, nodes, 'b')).toBe('b')
    expect(currentUnit(l, nodes, 'r1')).toBe('stack:c')
    expect(currentUnit(l, nodes, 't')).toBe('a')
    expect(currentUnit(l, nodes, undefined)).toBe(null)
  })

  it('routes from the top down', () => {
    expect(routeTo(l, 'stack:c')).toEqual(['a', 'b', 'c', 'stack:c'])
  })

  it('selects every fork down to the target', () => {
    const { target, selection } = jumpSelection(nodes, l.byId.get('c')!, { a: 't' })
    expect(target.id).toBe('c')
    expect(selection).toEqual({ [ROOT_KEY]: 'a', a: 'b', b: 'c' })
  })

  it('jumps into a stack at the remembered attempt, else the newest', () => {
    const stack = l.byId.get('stack:c')!
    expect(jumpSelection(nodes, stack, { c: 'r1' }).target.id).toBe('r1')
    expect(jumpSelection(nodes, stack, {}).target.id).toBe('r2')
    expect(jumpSelection(nodes, stack, { c: 'gone' }).selection.c).toBe('r2')
  })
})

describe('tree map keys across changes', () => {
  /** Keys of `nodes`' layout after a first layout of `before`, by unit id. */
  const keysAfter = (before: ChatNode[], nodes: ChatNode[]) => {
    // (The chat ends at the newest node.)
    const end = (ns: ChatNode[]) => ns.reduce((p, n) => (n.createdAt > p.createdAt ? n : p)).id
    const first = carryKeys(new Map(), layoutTree(before, end(before)))
    return carryKeys(first.byNode, layoutTree(nodes, end(nodes))).byUnit
  }

  it('keeps a lone attempt as the stack it becomes', () => {
    const a = br('a', null)
    const r1 = node('r1', 'a')
    const keys = keysAfter([a, r1], [a, r1, node('r2', 'a')])
    expect(keys.get('stack:a')).toBe('r1')
    expect(keys.get('a')).toBe('a')
  })

  it('hands a stack to the attempt followed up from it', () => {
    const a = br('a', null)
    const r1 = node('r1', 'a')
    const r2 = node('r2', 'a')
    const keys = keysAfter([a, r1, r2], [a, r1, { ...r2, branch: true }, node('f', 'r2')])
    expect(keys.get('r2')).toBe('stack:a')
    expect(keys.get('f')).toBe('f')
  })

  it('gives every unit its own key', () => {
    const a = br('a', null)
    const keys = keysAfter([a, node('r1', 'a')], [a, br('r1', 'a'), br('r2', 'a'), node('x', 'r1'), node('y', 'r2')])
    expect(new Set(keys.values()).size).toBe(keys.size)
  })
})

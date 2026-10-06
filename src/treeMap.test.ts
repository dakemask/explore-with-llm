import { describe, expect, it } from 'vitest'
import { ROOT_KEY, type ChatNode } from './db'
import { currentUnit, firstLine, jumpSelection, layoutTree, routeTo, type TreeLayout } from './lib/treeMap'

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
      requestBody: null,
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
    const l = layoutTree([br('a', null), br('b', 'a'), node('c', 'b')])
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

  it('stacks attempts only where a fork has nothing else', () => {
    const l = layoutTree([br('a', null), node('t1', 'a'), node('t2', 'a'), node('t3', 'a')])
    const stack = l.byId.get('stack:a')!
    expect(stack.type).toBe('stack')
    expect(stack.nodes.map((n) => n.id)).toEqual(['t1', 't2', 't3'])
    expect(l.unitOf.get('t2')).toBe('stack:a')
    expect(l.units).toHaveLength(2)
    // A single attempt is a plain unit.
    expect(layoutTree([br('a', null), node('t', 'a')]).byId.get('t')?.type).toBe('node')
    // Attempts at the top stack under the root key.
    expect(layoutTree([node('p', null), node('q', null)]).byId.has('stack:' + ROOT_KEY)).toBe(true)
  })

  it('does not draw attempts beside branches', () => {
    const l = layoutTree([br('a', null), br('b', 'a'), node('t', 'a'), node('u', 'a')])
    expect([...l.byId.keys()]).toEqual(['a', 'b'])
    expect(pos(l, 'b')).toEqual([1, 0])
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
  const l = layoutTree(nodes)

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

  it('takes the first line for tips', () => {
    expect(firstLine('\n## Title here\nmore')).toBe('Title here')
    expect(firstLine('x'.repeat(50))).toBe('x'.repeat(40) + '…')
  })
})

import { describe, expect, it } from 'vitest'
import type { ChatNode } from './db'
import { branchColors, GREY } from './lib/colors'

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

describe('branch colors', () => {
  it('keeps a chain in one color', () => {
    const c = branchColors([br('a', null), br('b', 'a'), br('c', 'b'), node('d', 'c')])
    expect([...c.values()]).toEqual([0, 0, 0, GREY])
  })

  it('does not treat one branch plus attempts as a fork', () => {
    const c = branchColors([br('a', null), br('b', 'a'), node('t1', 'a'), node('t2', 'a'), node('x', 'b')])
    expect(c.get('b')).toBe(0)
    expect(c.get('x')).toBe(GREY)
    expect(c.get('t1')).toBe(GREY)
    expect(c.get('t2')).toBe(GREY)
  })

  it('gives the branches of a fork the next colors in creation order', () => {
    const nodes = [br('a', null), br('b1', 'a'), br('b2', 'a'), node('t', 'a'), br('b3', 'a')]
    const c = branchColors(nodes)
    expect([c.get('b1'), c.get('b2'), c.get('b3'), c.get('t')]).toEqual([1, 2, 3, GREY])
  })

  it('orders branches by when they became branches: a new one comes last, the others keep their colors', () => {
    const nodes = [br('a', null), node('old', 'a'), br('b1', 'a', { branchAt: 100 }), br('b2', 'a', { branchAt: 200 })]
    expect([nodes[2], nodes[3]].map((n) => branchColors(nodes).get(n.id))).toEqual([1, 2])
    // The oldest attempt becomes a branch now: it goes after them.
    nodes[1] = { ...nodes[1], branch: true, branchAt: 300 }
    const c = branchColors(nodes)
    expect([c.get('b1'), c.get('b2'), c.get('old')]).toEqual([1, 2, 3])
  })

  it('continues a nested fork from the branch color and wraps around the ring', () => {
    const nodes = [br('a', null)]
    for (let i = 1; i <= 6; i++) nodes.push(br(`b${i}`, 'a'))
    nodes.push(br('x1', 'b6'), br('x2', 'b6'), br('y', 'x2'))
    const c = branchColors(nodes)
    expect(c.get('b6')).toBe(6)
    expect(c.get('x1')).toBe(0)
    expect(c.get('x2')).toBe(1)
    expect(c.get('y')).toBe(1)
  })

  it('greys every attempt, a lone one too', () => {
    const c = branchColors([br('a', null), br('f1', 'a'), br('f2', 'a'), node('lone', 'f2'), node('s1', 'f1'), node('s2', 'f1')])
    expect(c.get('f2')).toBe(2)
    expect(c.get('lone')).toBe(GREY)
    expect(c.get('s1')).toBe(GREY)
    expect(c.get('s2')).toBe(GREY)
  })

  it('ignores archived siblings', () => {
    const nodes = [br('a', null), br('b1', 'a'), br('b2', 'a', { archived: 1 }), node('x', 'b1')]
    const c = branchColors(nodes)
    expect(c.get('b1')).toBe(0)
    expect(c.get('x')).toBe(GREY)
    expect(c.has('b2')).toBe(false)
    // Not archived, the same b2 makes a fork and b1 takes the next color.
    expect(branchColors([br('a', null), br('b1', 'a'), br('b2', 'a'), node('x', 'b1')]).get('b1')).toBe(1)
  })

  it('leaves side questions uncolored', () => {
    const c = branchColors([
      br('a', null),
      node('s', 'a', { kind: 'side', thread: 'th', anchor: { start: 0, end: 1, text: 'a' } }),
    ])
    expect(c.has('s')).toBe(false)
  })
})

/**
 * Mapping between rendered Markdown and offsets in its source text, for side-question anchors.
 *
 * Offsets are always into the original assistant content. The renderer rewrites `\( \)` / `\[ \]` math
 * before parsing, so `normalizeMathMapped` keeps a map from the rewritten text back to the original.
 * `rehypeAnchors` wraps every rendered text run in an element carrying its source range (`data-s`/`data-e`)
 * and highlights anchored ranges; `rangeToSource` turns a DOM selection back into a source range.
 */
import type { Element, ElementContent, Root, Text } from 'hast'

// ---------- Math normalization with an offset map ----------

export interface Normalized {
  text: string
  /** For each char of `text`, its offset in the original. */
  map: number[]
}

/** Models often emit \( \) and \[ \] delimiters; remark-math only understands $ / $$. Code is left untouched. */
export function normalizeMathMapped(src: string): Normalized {
  let text = ''
  const map: number[] = []
  const copy = (from: number, to: number) => {
    text += src.slice(from, to)
    for (let i = from; i < to; i++) map.push(i)
  }
  const insert = (s: string, at: number) => {
    text += s
    for (let i = 0; i < s.length; i++) map.push(at)
  }
  const mathRe = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g
  const codeRe = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g
  let pos = 0
  const prose = (end: number) => {
    mathRe.lastIndex = pos
    for (let m = mathRe.exec(src); m && m.index < end; m = mathRe.exec(src)) {
      if (m.index + m[0].length > end) break
      const display = m[1] !== undefined
      const inner = (display ? m[1] : m[2])!
      const lead = inner.length - inner.trimStart().length
      const innerStart = m.index + 2 + lead
      const innerEnd = m.index + 2 + inner.trimEnd().length
      const close = m.index + m[0].length - 1 // last char of the closing delimiter
      copy(pos, m.index)
      insert(display ? '\n$$\n' : '$', m.index)
      copy(innerStart, innerEnd)
      insert(display ? '\n$$\n' : '$', close)
      pos = m.index + m[0].length
    }
    copy(pos, end)
    pos = end
  }
  for (let c = codeRe.exec(src); c; c = codeRe.exec(src)) {
    if (c[0].length === 0) {
      codeRe.lastIndex++
      continue
    }
    prose(c.index)
    copy(c.index, c.index + c[0].length)
    pos = c.index + c[0].length
  }
  prose(src.length)
  return { text, map }
}

// ---------- Char ↔ source alignment inside one text run ----------

/**
 * Source position (relative to `src`) of each char of `value`, where `src` is the Markdown that rendered
 * as `value` (it may contain extra escapes, entities or backticks). Greedy, which is exact for those cases.
 */
function align(value: string, src: string): number[] {
  if (value.length === src.length) return Array.from(value, (_, i) => i)
  const pos: number[] = []
  let j = 0
  for (let i = 0; i < value.length; i++) {
    let k = j
    while (k < src.length && src[k] !== value[i]) k++
    if (k === src.length) k = Math.min(j, src.length - 1)
    pos.push(k)
    j = k + 1
  }
  return pos
}

/** Source offset (relative) of the boundary before char `i`; whole runs map to the whole source range. */
function boundary(pos: number[], i: number, srcLen: number, side: 'start' | 'end') {
  if (i <= 0) return 0
  if (i >= pos.length) return srcLen
  return side === 'start' ? pos[i] : pos[i - 1] + 1
}

// ---------- Rehype plugin ----------

export interface AnchorMark {
  /** Thread id, written to `data-threads` on highlights. */
  id: string
  start: number
  end: number
  active?: boolean
}

interface Ctx {
  orig: string
  norm: Normalized
  anchors: AnchorMark[]
}

type Pos = { start: { offset?: number }; end: { offset?: number } } | undefined

function offsets(position: Pos): [number, number] | null {
  const s = position?.start.offset
  const e = position?.end.offset
  return s == null || e == null ? null : [s, e]
}

/** Normalized-text range → original range. */
function toOrig(ctx: Ctx, s: number, e: number): [number, number] {
  const { map } = ctx.norm
  const last = map.length ? map[map.length - 1] + 1 : 0
  const os = s < map.length ? map[s] : last
  const oe = e > s ? (e - 1 < map.length ? map[e - 1] + 1 : last) : os
  return [os, Math.max(os, oe)]
}

function covering(ctx: Ctx, s: number, e: number) {
  return ctx.anchors.filter((a) => a.start < e && a.end > s)
}

function markProps(ctx: Ctx, s: number, e: number, base: Record<string, unknown> = {}) {
  const hits = covering(ctx, s, e)
  const props: Record<string, unknown> = { ...base, dataS: s, dataE: e }
  if (hits.length) {
    const cls = ['anchor-hl', ...(hits.some((h) => h.active) ? ['active'] : [])]
    const prev = base.className
    props.className = [...(Array.isArray(prev) ? prev : prev ? [prev] : []), ...cls]
    props.dataThreads = hits.map((h) => h.id).join(' ')
  }
  return props
}

/** Splits one text run (original range os..oe) at anchor boundaries into `data-s` elements. */
function pieces(ctx: Ctx, value: string, os: number, oe: number): Element[] {
  const src = ctx.orig.slice(os, oe)
  const pos = align(value, src)
  const cuts = new Set([0, value.length])
  for (const a of ctx.anchors) {
    for (const x of [a.start, a.end]) {
      if (x > os && x < oe) cuts.add(pos.filter((p) => os + p < x).length)
    }
  }
  const sorted = [...cuts].sort((a, b) => a - b)
  const out: Element[] = []
  for (let k = 0; k + 1 < sorted.length; k++) {
    const i0 = sorted[k]
    const i1 = sorted[k + 1]
    if (i1 <= i0) continue
    const s = os + boundary(pos, i0, src.length, 'start')
    const e = os + boundary(pos, i1, src.length, 'end')
    const props = markProps(ctx, s, e)
    out.push({
      type: 'element',
      tagName: props.dataThreads ? 'mark' : 'span',
      properties: props as Element['properties'],
      children: [{ type: 'text', value: value.slice(i0, i1) }],
    })
  }
  return out
}

function hasPosition(n: ElementContent): boolean {
  if (offsets(n.position)) return true
  return n.type === 'element' && n.children.some(hasPosition)
}

function textNodes(n: ElementContent, out: Text[] = []): Text[] {
  if (n.type === 'text') out.push(n)
  else if (n.type === 'element') n.children.forEach((c) => textNodes(c, out))
  return out
}

/** Element whose rendered text appears verbatim in its source (highlighted code): exact pieces per text node. */
function wrapVerbatim(ctx: Ctx, el: Element, s: number, e: number): boolean {
  const texts = textNodes(el)
  const joined = texts.map((t) => t.value).join('')
  const idx = joined ? ctx.norm.text.slice(s, e).indexOf(joined) : -1
  if (idx < 0) return false
  let at = s + idx
  const replace = (parent: Element) => {
    parent.children = parent.children.flatMap((c): ElementContent[] => {
      if (c.type === 'element') {
        replace(c)
        return [c]
      }
      if (c.type !== 'text') return [c]
      const [os, oe] = toOrig(ctx, at, at + c.value.length)
      at += c.value.length
      return pieces(ctx, c.value, os, oe)
    })
  }
  replace(el)
  return true
}

function walk(ctx: Ctx, parent: Root | Element, lo: number, hi: number) {
  const kids = parent.children as ElementContent[]
  const ranges = kids.map((c) => offsets(c.position))
  const next: ElementContent[] = []
  kids.forEach((c, i) => {
    // Unpositioned nodes (math, highlighted code) span the gap between their positioned neighbours.
    let s = lo
    for (let j = i - 1; j >= 0; j--) if (ranges[j]) { s = ranges[j]![1]; break }
    let e = hi
    for (let j = i + 1; j < kids.length; j++) if (ranges[j]) { e = ranges[j]![0]; break }
    const own = ranges[i]
    if (own) [s, e] = own
    if (c.type === 'text') {
      if (!own && !c.value.trim()) return void next.push(c)
      const [os, oe] = toOrig(ctx, s, e)
      next.push(...pieces(ctx, c.value, os, oe))
    } else if (c.type === 'element') {
      if (c.children.some(hasPosition)) walk(ctx, c, s, e)
      else if (!wrapVerbatim(ctx, c, s, e)) {
        // Atomic (rendered math): selectable and highlightable only as a whole.
        const [os, oe] = toOrig(ctx, s, e)
        c.properties = markProps(ctx, os, oe, { ...c.properties, dataAtomic: true }) as Element['properties']
      }
      next.push(c)
    } else next.push(c)
  })
  parent.children = next as typeof parent.children
}

/** Rehype plugin; must run after highlighting and KaTeX so it sees the final tree. */
export function rehypeAnchors(opts: { orig: string; norm: Normalized; anchors: AnchorMark[] }) {
  return (tree: Root) => {
    walk(opts, tree, 0, opts.norm.text.length)
  }
}

// ---------- DOM selection → source range ----------

function pieceOffset(el: HTMLElement, node: Node, offset: number, side: 'start' | 'end', source: string) {
  const s = Number(el.dataset.s)
  const e = Number(el.dataset.e)
  if (el.dataset.atomic !== undefined || !el.contains(node)) return side === 'start' ? s : e
  const value = el.textContent ?? ''
  const i = node.nodeType === Node.TEXT_NODE ? offset : offset === 0 ? 0 : value.length
  const src = source.slice(s, e)
  return s + boundary(align(value, src), i, src.length, side)
}

/** Source range covered by `range` inside a `rehypeAnchors`-rendered `root`, trimmed of whitespace. */
export function rangeToSource(root: HTMLElement, range: Range, source: string): { start: number; end: number } | null {
  const hits = [...root.querySelectorAll<HTMLElement>('[data-s]')].filter((el) => range.intersectsNode(el))
  if (!hits.length) return null
  let start = pieceOffset(hits[0], range.startContainer, range.startOffset, 'start', source)
  let end = pieceOffset(hits[hits.length - 1], range.endContainer, range.endOffset, 'end', source)
  while (start < end && /\s/.test(source[start])) start++
  while (end > start && /\s/.test(source[end - 1])) end--
  return end > start ? { start, end } : null
}

// ---------- Editing around locked ranges ----------

export interface Lock {
  start: number
  end: number
}

/**
 * Part of `prev` replaced to produce `next`. `caret` (the cursor after the edit) disambiguates
 * repeated characters: typing and deleting leave the cursor right after the changed text.
 */
export function editRegion(prev: string, next: string, caret: number) {
  const delta = next.length - prev.length
  let tail = next.length - caret
  if (tail < 0 || tail > prev.length || prev.slice(prev.length - tail) !== next.slice(caret)) {
    tail = 0
    while (tail < Math.min(prev.length, next.length) && prev[prev.length - 1 - tail] === next[next.length - 1 - tail]) tail++
  }
  let head = 0
  const max = Math.min(prev.length, next.length) - tail
  while (head < max && prev[head] === next[head]) head++
  return { from: head, to: prev.length - tail, delta }
}

/** Locks shifted for the edit `prev` → `next`, or null if the edit touches the inside of a lock. */
export function shiftLocks<T extends Lock>(locks: T[], prev: string, next: string, caret: number): T[] | null {
  const { from, to, delta } = editRegion(prev, next, caret)
  const out: T[] = []
  for (const l of locks) {
    const touches = from === to ? from > l.start && from < l.end : from < l.end && to > l.start
    if (touches) return null
    out.push(to <= l.start ? { ...l, start: l.start + delta, end: l.end + delta } : l)
  }
  return out
}

/** Quoted Markdown made readable for display (the model still gets the source): drops markers, keeps math. */
export function plainQuote(md: string) {
  return md
    .split('\n')
    .filter((l) => !/^\s*(```|~~~)/.test(l))
    .map((l) => l.replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, ''))
    .join('\n')
    .replace(/\*\*|`+/g, '')
}

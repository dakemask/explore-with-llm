/**
 * Layout math for the side-question column (`components/side/SideColumn.tsx`): where the chat and the
 * column go in the scroll area, where collapsed cards sit, which cards an expanded one covers, and the
 * lanes of the marker strip. Pure functions on measured numbers (px, relative to the scroll content).
 */
import { PANE_MAX, PANE_MIN } from './panes'

/** Widest the chat column gets (Tailwind `max-w-3xl`). */
export const CHAT_MAX = 768
/** Height of a collapsed card, and the smallest gap between two of them. */
export const CARD_HEIGHT = 36
export const CARD_GAP = 8

export interface Frame {
  chatLeft: number
  chatWidth: number
  /** The column's left edge (right after the chat) and width; 0 wide when there's no column. */
  sideLeft: number
  sideWidth: number
}

/** The marker strip's width: the column's left part (cards start right of it), all of it when collapsed. */
export const STRIP = 14
/** The column (dragged wider) never leaves the chat narrower than this, unless the column is at its minimum. */
export const CHAT_MIN = 420

/**
 * The column's width in a scroll area `width` wide: collapsed = the marker strip; open = the width the
 * user dragged it to (`wanted`), within its limits and leaving the chat at least `CHAT_MIN`. It depends only
 * on these (never on what the column shows), so opening or collapsing a card never re-flows the chat.
 */
export function sideWidth(width: number, open: boolean, wanted: number) {
  return open ? Math.round(Math.max(PANE_MIN.column, Math.min(wanted, PANE_MAX.column, width - CHAT_MIN))) : STRIP
}

/** The chat stays centered while the column (`side` px, 0 = none) fits beside it; otherwise it moves left, then narrows. */
export function columnFrame(width: number, sideWidth: number): Frame {
  const side = sideWidth > 0
  const chatWidth = Math.max(0, Math.min(CHAT_MAX, width - sideWidth))
  const centered = (width - chatWidth) / 2
  const chatLeft = Math.round(side ? Math.max(0, Math.min(centered, width - sideWidth - chatWidth)) : centered)
  return { chatLeft, chatWidth, sideLeft: chatLeft + chatWidth, sideWidth }
}

/**
 * Collapsed cards in anchor order, at least `height + gap` apart and none above 0, placed as near their ideal
 * tops as they can be (least total squared distance): a crowded group centers on its ideals rather than
 * pushing down from the first, using the room above it too (owner, 2026-10-10). Groups that then collide
 * merge and center together (pool adjacent violators, on the ideals less each card's place in the stack).
 */
export function stackCards(ideals: number[], height = CARD_HEIGHT, gap = CARD_GAP): number[] {
  const step = height + gap
  const groups: { sum: number; count: number }[] = []
  ideals.forEach((ideal, i) => {
    groups.push({ sum: ideal - i * step, count: 1 })
    while (groups.length > 1) {
      const last = groups[groups.length - 1]
      const prev = groups[groups.length - 2]
      if (prev.sum / prev.count < last.sum / last.count) break
      prev.sum += last.sum
      prev.count += last.count
      groups.pop()
    }
  })
  const tops: number[] = []
  for (const g of groups) {
    const base = Math.max(0, g.sum / g.count)
    for (let k = 0; k < g.count; k++) tops.push(base + tops.length * step)
  }
  return tops
}

/** Indexes of the collapsed cards (at `tops`) that an expanded card spanning `top`..`bottom` covers. */
export function coveredCards(tops: number[], top: number, bottom: number, height = CARD_HEIGHT): number[] {
  const out: number[] = []
  tops.forEach((t, i) => {
    if (t < bottom && t + height > top) out.push(i)
  })
  return out
}

export interface Span {
  top: number
  bottom: number
}

/**
 * Side-by-side lanes for the marker bars: spans in order of their tops, each in the first lane that is
 * free by then (a bar ends at least `gap` above the next one in its lane). Returns each span's lane.
 */
export function markerLanes(spans: Span[], gap = 2): { lanes: number[]; count: number } {
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].top - spans[b].top || spans[a].bottom - spans[b].bottom)
  const ends: number[] = []
  const lanes: number[] = new Array(spans.length)
  for (const i of order) {
    let lane = ends.findIndex((end) => end + gap <= spans[i].top)
    if (lane < 0) lane = ends.length
    ends[lane] = spans[i].bottom
    lanes[i] = lane
  }
  return { lanes, count: ends.length }
}

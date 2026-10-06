/**
 * Layout math for the side-question column (`components/side/SideColumn.tsx`): where the chat and the
 * column go in the scroll area, where collapsed cards sit, which cards an expanded one covers, and the
 * lanes of the marker strip. Pure functions on measured numbers (px, relative to the scroll content).
 */

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

/**
 * The chat stays centered while the column fits beside it; otherwise it moves left, then narrows.
 * The column's width depends only on the scroll area's width (never on what it shows), so opening or
 * collapsing a card never re-flows the chat.
 */
export function columnFrame(width: number, side: boolean): Frame {
  const sideWidth = side ? Math.round(Math.min(440, Math.max(280, width * 0.4))) : 0
  const chatWidth = Math.max(0, Math.min(CHAT_MAX, width - sideWidth))
  const centered = (width - chatWidth) / 2
  const chatLeft = Math.round(side ? Math.max(0, Math.min(centered, width - sideWidth - chatWidth)) : centered)
  return { chatLeft, chatWidth, sideLeft: chatLeft + chatWidth, sideWidth }
}

/** Collapsed cards in anchor order: each at its ideal top, pushed down only where it would overlap the one above. */
export function stackCards(ideals: number[], height = CARD_HEIGHT, gap = CARD_GAP): number[] {
  const tops: number[] = []
  for (const ideal of ideals) {
    const prev = tops[tops.length - 1]
    tops.push(prev === undefined ? ideal : Math.max(ideal, prev + height + gap))
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

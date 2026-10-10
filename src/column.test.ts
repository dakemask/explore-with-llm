import { describe, expect, it } from 'vitest'
import { CARD_GAP, CARD_HEIGHT, CHAT_MAX, CHAT_MIN, columnFrame, coveredCards, markerLanes, sideWidth, stackCards, STRIP } from './lib/column'
import { PANE_MAX, PANE_MIN } from './lib/panes'

describe('columnFrame', () => {
  it('centers the chat without a column', () => {
    expect(columnFrame(1000, 0)).toEqual({ chatLeft: 116, chatWidth: CHAT_MAX, sideLeft: 884, sideWidth: 0 })
  })

  it('keeps the chat centered when the column fits beside it', () => {
    const f = columnFrame(1664, 440)
    expect(f.chatWidth).toBe(CHAT_MAX)
    expect(f.chatLeft).toBe((1664 - CHAT_MAX) / 2)
    expect(f.sideLeft + f.sideWidth).toBeLessThanOrEqual(1664)
  })

  it('moves the chat left, then narrows it', () => {
    const f = columnFrame(1300, 440)
    expect(f.chatWidth).toBe(CHAT_MAX)
    expect(f.sideLeft + f.sideWidth).toBe(1300)
    const g = columnFrame(1024, 410)
    expect(g.chatLeft).toBe(0)
    expect(g.chatWidth).toBe(1024 - 410)
  })

  it('never overflows', () => {
    for (const w of [500, 584, 700, 900, 1200, 1500, 2400]) {
      for (const open of [true, false]) {
        const f = columnFrame(w, sideWidth(w, open, 380))
        expect(f.sideLeft + f.sideWidth).toBeLessThanOrEqual(Math.max(w, f.sideWidth))
      }
    }
  })
})

describe('sideWidth', () => {
  it('is the marker strip when collapsed', () => {
    expect(sideWidth(1200, false, 500)).toBe(STRIP)
  })

  it('is the dragged width within its limits', () => {
    expect(sideWidth(1400, true, 500)).toBe(500)
    expect(sideWidth(2400, true, 9999)).toBe(PANE_MAX.column)
    expect(sideWidth(1400, true, 10)).toBe(PANE_MIN.column)
  })

  it('leaves the chat at least CHAT_MIN, the column at least its minimum', () => {
    expect(sideWidth(900, true, 600)).toBe(900 - CHAT_MIN)
    expect(sideWidth(600, true, 600)).toBe(PANE_MIN.column)
  })
})

describe('stackCards', () => {
  it('keeps cards at their ideal tops when they fit', () => {
    expect(stackCards([0, 100, 300])).toEqual([0, 100, 300])
  })

  it('centers a crowded group on its ideals, using the room above it', () => {
    const step = CARD_HEIGHT + CARD_GAP
    expect(stackCards([100, 110, 120, 500])).toEqual([110 - step, 110, 110 + step, 500])
    expect(stackCards([100, 100 + step + 5])).toEqual([100, 100 + step + 5])
  })

  it('merges groups that collide once centered, and never goes above 0', () => {
    const step = CARD_HEIGHT + CARD_GAP
    // [150, 150] centers to 150 ∓ step / 2, reaching into [100, 100]'s: all four center together.
    expect(stackCards([100, 100, 150, 150])).toEqual([125 - 1.5 * step, 125 - 0.5 * step, 125 + 0.5 * step, 125 + 1.5 * step])
    expect(stackCards([0, 0, 0])).toEqual([0, step, 2 * step])
  })
})

describe('coveredCards', () => {
  it('lists the cards the expanded card overlaps', () => {
    const tops = [0, 50, 100, 400]
    expect(coveredCards(tops, 40, 380)).toEqual([1, 2])
    expect(coveredCards(tops, 30, 380)).toEqual([0, 1, 2])
    expect(coveredCards(tops, 36, 50)).toEqual([])
    expect(coveredCards(tops, 120, 500)).toEqual([2, 3])
  })
})

describe('markerLanes', () => {
  it('puts separate spans in one lane, overlapping ones side by side', () => {
    const spans = [
      { top: 0, bottom: 20 },
      { top: 24, bottom: 44 }, // the next line: same lane
      { top: 10, bottom: 60 }, // overlaps both
      { top: 50, bottom: 70 }, // overlaps the third only
      { top: 100, bottom: 120 },
    ]
    expect(markerLanes(spans)).toEqual({ lanes: [0, 0, 1, 0, 0], count: 2 })
  })

  it('takes the first free lane', () => {
    const spans = [
      { top: 0, bottom: 100 },
      { top: 10, bottom: 30 },
      { top: 20, bottom: 40 },
      { top: 50, bottom: 60 },
    ]
    expect(markerLanes(spans)).toEqual({ lanes: [0, 1, 2, 1], count: 3 })
  })

  it('handles no spans', () => {
    expect(markerLanes([])).toEqual({ lanes: [], count: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import { CARD_GAP, CARD_HEIGHT, CHAT_MAX, columnFrame, coveredCards, markerLanes, stackCards } from './lib/column'

describe('columnFrame', () => {
  it('centers the chat without a column', () => {
    expect(columnFrame(1000, false)).toEqual({ chatLeft: 116, chatWidth: CHAT_MAX, sideLeft: 884, sideWidth: 0 })
  })

  it('keeps the chat centered when the column fits beside it', () => {
    const f = columnFrame(1664, true)
    expect(f.sideWidth).toBe(440)
    expect(f.chatWidth).toBe(CHAT_MAX)
    expect(f.chatLeft).toBe((1664 - CHAT_MAX) / 2)
    expect(f.sideLeft + f.sideWidth).toBeLessThanOrEqual(1664)
  })

  it('moves the chat left, then narrows it', () => {
    const f = columnFrame(1300, true)
    expect(f.chatWidth).toBe(CHAT_MAX)
    expect(f.sideLeft + f.sideWidth).toBe(1300)
    const g = columnFrame(1024, true)
    expect(g.chatLeft).toBe(0)
    expect(g.sideWidth).toBe(410)
    expect(g.chatWidth).toBe(1024 - 410)
  })

  it('never overflows, down to the minimum column width', () => {
    for (const w of [500, 584, 700, 900, 1200, 1500, 2400]) {
      const f = columnFrame(w, true)
      expect(f.sideWidth).toBeGreaterThanOrEqual(280)
      expect(f.sideLeft + f.sideWidth).toBeLessThanOrEqual(Math.max(w, f.sideWidth))
    }
  })
})

describe('stackCards', () => {
  it('keeps cards at their ideal tops when they fit', () => {
    expect(stackCards([0, 100, 300])).toEqual([0, 100, 300])
  })

  it('pushes a card down only as far as needed, and the push carries on', () => {
    const step = CARD_HEIGHT + CARD_GAP
    expect(stackCards([100, 110, 120, 500])).toEqual([100, 100 + step, 100 + 2 * step, 500])
    expect(stackCards([100, 100 + step + 5])).toEqual([100, 100 + step + 5])
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

import { describe, expect, it } from 'vitest'
import { band, placeLine, stepLine, turnAt } from './lib/reading'

// A 900 px tall visible chat; turns as content tops (the last one's end = `end`).
const H = 900
const chat = (tops: number[], end: number) => {
  const max = end - H
  const view = (s: number) => ({ h: H, s, rest: max - s })
  const current = (s: number, r: number) => turnAt(tops.map((t) => t - s), r)
  /** Scrolls from `s0` to `s1` in `step` px steps from line `r`; the turns current after each step. */
  const scroll = (s0: number, s1: number, r: number, step = 10) => {
    const seen: number[] = []
    let s = s0
    while (s !== s1) {
      const next = s1 > s ? Math.min(s1, s + step) : Math.max(s1, s - step)
      r = stepLine(r, view(s), view(next))
      s = next
      seen.push(current(s, r))
    }
    return { r, seen }
  }
  return { max, view, current, scroll }
}
const steadily = (seen: number[], from: number) =>
  [from, ...seen].every((t, i, all) => i === 0 || Math.abs(t - all[i - 1]) <= 1)

describe('reading line: scrolling by hand', () => {
  // 12 turns 400 px apart, a short last one (120 px).
  const tops = Array.from({ length: 12 }, (_, i) => i * 400)
  const c = chat(tops, 11 * 400 + 120)

  it('inside the band it moves with the content: a little scrolling keeps "current"', () => {
    const s = 2000
    const r = 400 // content 2400 → turn 6 (index 6)
    expect(c.current(s, r)).toBe(6)
    for (const d of [-80, -30, 30, 80]) expect(c.current(s + d, stepLine(r, c.view(s), c.view(s + d)))).toBe(6)
  })

  it('at the band edge it stays: the turns pass it', () => {
    const { r } = c.scroll(2000, 2600, 400)
    expect(r).toBeCloseTo(band(H)[0])
  })

  it('down to the end: one turn at a time, the short last one current at the end', () => {
    const { r, seen } = c.scroll(1000, c.max, 400)
    expect(steadily(seen, c.current(1000, 400))).toBe(true)
    expect(seen.at(-1)).toBe(11)
    expect(r).toBe(H - 1)
  })

  it('up to the top: one turn at a time, the first current at the top', () => {
    const { r, seen } = c.scroll(c.max, 0, H - 1)
    expect(steadily(seen, 11)).toBe(true)
    expect(seen.at(-1)).toBe(0)
    expect(r).toBe(0)
  })

  it('pushed to an edge, it comes back to the band a screen away', () => {
    const { r } = c.scroll(c.max, c.max - H - 50, H - 1)
    const [lo, hi] = band(H)
    expect(r).toBeGreaterThanOrEqual(lo)
    expect(r).toBeLessThanOrEqual(hi)
    const back = c.scroll(0, H + 50, 0).r
    expect(back).toBeGreaterThanOrEqual(lo)
    expect(back).toBeLessThanOrEqual(hi)
  })

  it('"current" never moves against the scroll', () => {
    const down = c.scroll(500, c.max, 300).seen
    expect(down.every((t, i) => i === 0 || t >= down[i - 1])).toBe(true)
    const up = c.scroll(c.max, 300, 700).seen
    expect(up.every((t, i) => i === 0 || t <= up[i - 1])).toBe(true)
  })
})

describe('reading line: after a choice', () => {
  const tops = Array.from({ length: 12 }, (_, i) => i * 400)
  const c = chat(tops, 12 * 400)

  it('a switcher low on the screen: that turn is current, and stays so scrolling down', () => {
    const s = 1620 // turn 6 (index 6) at 780–1180 on screen
    const r = placeLine(780, 1180, H)
    expect(c.current(s, r)).toBe(6)
    const { seen } = c.scroll(s, s + 300, r)
    expect(seen.every((t) => t === 6)).toBe(true)
  })

  it('… scrolling up from there: back one turn at a time', () => {
    const s = 1620
    const r = placeLine(780, 1180, H)
    const { seen } = c.scroll(s, s - 800, r)
    expect(steadily(seen, 6)).toBe(true)
  })

  it('a jump near the top (nothing above to scroll): the chosen turn, also scrolling down a little', () => {
    // Turn 2 (index 1) at 400 on screen, the view at the very top.
    const r = placeLine(400, 800, H)
    expect(c.current(0, r)).toBe(1)
    expect(c.scroll(0, 150, r).seen.every((t) => t === 1)).toBe(true)
  })

  it('a jump near the end over blank space: the chosen turn, not the last', () => {
    // Turn 11 (index 10) at the top, 300 px of blank below the last turn: nothing left to scroll.
    const s = 10 * 400 - 90
    const blank = { h: H, s, rest: 0 }
    const r = placeLine(90, 490, H)
    expect(c.current(s, r)).toBe(10)
    // Scrolling back up a little keeps it.
    const r2 = stepLine(r, blank, { h: H, s: s - 60, rest: 0 })
    expect(c.current(s - 60, r2)).toBe(10)
  })
})

describe('placing the line in a chosen turn', () => {
  const [lo] = band(H)
  it('a turn across the band top: at the band top', () => expect(placeLine(100, 800, H)).toBe(lo))
  it('a turn below it: just under its top', () => expect(placeLine(700, 820, H)).toBe(712))
  it('a short turn above it: just under its top (not at its bottom, a scroll would leave it at once)', () =>
    expect(placeLine(80, 200, H)).toBe(92))
  it('kept on screen', () => expect(placeLine(950, 1200, H)).toBe(H - 1))
})

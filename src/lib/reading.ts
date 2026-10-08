import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import type { AutoScroll } from './hooks'

/**
 * The chat's *reading line* (owner, 2026-10-09): an invisible line across the visible chat; the turn it lies
 * in is the tree map's "current". It has a memory (it isn't a function of the scroll position):
 * - Choosing a turn (switcher, tree map jump, sending / retry / edit, opening a conversation) puts the line in
 *   that turn (`placeLine`), so "current" is at once what was chosen.
 * - Scrolling by hand (`stepLine`): in the middle band (a third to two thirds down) the line moves with the
 *   content, so "current" stays; at the band's edge it stays on screen and the turns pass it. Outside the band
 *   (put there by a choice) it only ever moves toward the band, never away.
 * - Within a screen of an end, scrolling toward it pushes the line toward that edge, reaching it as the view
 *   reaches the end (so the first / last turn, however short, become current); scrolling away from it draws a
 *   pushed line back to the band. Scrolling on at an end (wheel / keys, nothing moves) moves the line on too.
 * - Nothing else moves it (content changing size, scrolls of our own: following, holds, jump glides).
 * Each change of "current" is to the next turn, never skipping one.
 */

/** The visible chat (the input box's cover left out), in px. */
export interface LineView {
  /** Its height. */
  h: number
  /** Scrolled from the top. */
  s: number
  /** Still scrollable below (blank space included). */
  rest: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** The middle band, as screen offsets from the visible chat's top. */
export const band = (h: number) => [h / 3, (2 * h) / 3] as const

/** Where the line goes into a chosen turn (its top / bottom on screen): the band's top if the turn reaches across it, else just below the turn's top. */
export function placeLine(top: number, bottom: number, h: number) {
  const [lo] = band(h)
  const y = top < lo && bottom > lo + INSET ? lo : top + INSET
  return clamp(Math.min(y, bottom - 1), 0, h - 1)
}
/** How far below a chosen turn's top the line goes (inside its frame, under the header). */
const INSET = 12

/** The line after the user scrolled from view `a` to view `b` (same height; `b.h` is used). */
export function stepLine(r: number, a: LineView, b: LineView) {
  const d = b.s - a.s
  const h = b.h
  const [lo, hi] = band(h)
  const bottom = h - 1
  // With the content inside the band, stopped at its edges; outside it, only toward it.
  let x = r - d
  if (r < lo) x = d < 0 ? Math.min(x, hi) : r
  else if (r > hi) x = d > 0 ? Math.max(x, lo) : r
  else x = clamp(x, lo, hi)
  // The last screen before an end: 0 at the end, 1 a screen (or more) away.
  const top = (v: LineView) => clamp(v.s, 0, h) / h
  const end = (v: LineView) => clamp(v.rest, 0, h) / h
  if (d < 0) {
    if (top(a) < 1) x *= top(b) / top(a)
    if (end(a) < 1 && x > hi) x = hi + ((x - hi) * (1 - end(b))) / (1 - end(a))
  } else if (d > 0) {
    if (end(a) < 1) x = end(a) > 0 ? bottom - ((bottom - x) * end(b)) / end(a) : bottom
    if (top(a) < 1 && x < lo) x = lo - ((lo - x) * (1 - top(b))) / (1 - top(a))
  }
  return clamp(x, 0, bottom)
}

/** The turn the line lies in, from the turns' tops on screen in order (a gap belongs to the turn above). */
export function turnAt(tops: number[], r: number) {
  let at = 0
  tops.forEach((t, i) => {
    if (t <= r) at = i
  })
  return at
}

/** Where a tree map jump puts the turn's top (with its header): near the top of the visible chat, fixed. */
export const jumpOffset = (h: number) => Math.max(40, h / 10)

/** Choose the last turn of the path (sending, retry / edit, opening a conversation). */
export const LAST = '\u0000last'

/**
 * The main chat's reading line (rules above). `select` puts it in a turn (by node id, or `LAST`); `current`
 * reads the turn it's in (a node id); `onChange` is told when the line moved without the chat scrolling.
 * A choice is kept as a pin until the user scrolls: then the line is placed in that turn as it was before the
 * scroll, and moves on from there.
 */
export function useReadingLine(scroll: AutoScroll, composer: RefObject<HTMLElement | null>, resetKey: string | null) {
  const line = useRef<{ r: number | null; pin: string | null }>({ r: null, pin: LAST })
  const listeners = useRef(new Set<() => void>())
  const changed = () => listeners.current.forEach((fn) => fn())

  const api = useMemo(() => {
    const box = () => scroll.containerRef.current
    const view = (el: HTMLElement) => {
      const area = el.getBoundingClientRect()
      const bottom = Math.min(area.bottom, composer.current?.getBoundingClientRect().top ?? area.bottom)
      return { top: area.top, h: Math.max(1, bottom - area.top), s: el.scrollTop, rest: el.scrollHeight - el.clientHeight - el.scrollTop }
    }
    const turns = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-turn]')]
    const pinned = (el: HTMLElement) => {
      const all = turns(el)
      const pin = line.current.pin
      return pin === LAST ? all[all.length - 1] : all.find((t) => t.dataset.turn === pin)
    }
    /** The pin becomes a line in its turn; `shift` = how far the content moved up since (the scroll being handled). */
    const unpin = (el: HTMLElement, v: { top: number; h: number }, shift: number) => {
      const l = line.current
      if (l.pin === null) return
      const t = pinned(el)
      l.pin = null
      if (!t) return void (l.r ??= band(v.h)[0])
      const rect = t.getBoundingClientRect()
      l.r = placeLine(rect.top - v.top + shift, rect.bottom - v.top + shift, v.h)
    }
    return {
      select: (id: string) => {
        line.current.pin = id
        changed()
      },
      current: (): string | undefined => {
        const el = box()
        if (!el) return
        const l = line.current
        if (l.pin !== null) return l.pin === LAST ? pinned(el)?.dataset.turn : l.pin
        const v = view(el)
        const all = turns(el)
        const at = turnAt(
          all.map((t) => t.getBoundingClientRect().top - v.top),
          clamp(l.r ?? band(v.h)[0], 0, v.h - 1),
        )
        return all[at]?.dataset.turn
      },
      /** The user scrolled. */
      scrolled: (from: { s: number; rest: number }, to: { s: number; rest: number }) => {
        const el = box()
        if (!el) return
        const v = view(el)
        unpin(el, v, to.s - from.s)
        const l = line.current
        l.r = stepLine(l.r ?? band(v.h)[0], { h: v.h, ...from }, { h: v.h, ...to })
      },
      /** The user scrolls on at an end (`dy` px, + = down) where nothing can move. */
      overscroll: (dy: number) => {
        const el = box()
        if (!el) return
        const v = view(el)
        unpin(el, v, 0)
        const l = line.current
        l.r = clamp((l.r ?? band(v.h)[0]) + dy, 0, v.h - 1)
        changed()
      },
    }
  }, [scroll.containerRef, composer])

  useEffect(() => scroll.onUserScrolled(api.scrolled), [scroll.onUserScrolled, api])
  // Opening a conversation: its last turn (the view is at the end).
  useEffect(() => api.select(LAST), [resetKey, api])

  // Scrolling on at an end: the wheel, or the scroll keys with focus in the chat (not in a text box).
  useEffect(() => {
    const el = scroll.containerRef.current
    if (!el) return
    const atTop = () => el.scrollTop <= 0
    const atEnd = () => el.scrollTop >= el.scrollHeight - el.clientHeight - 1
    const onWheel = (e: WheelEvent) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY
      if ((dy < 0 && atTop()) || (dy > 0 && atEnd())) api.overscroll(dy)
    }
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      const page = el.clientHeight * 0.9
      const dy = (
        {
          ArrowDown: 40,
          ArrowUp: -40,
          PageDown: page,
          PageUp: -page,
          ' ': e.shiftKey ? -page : page,
          End: Infinity,
          Home: -Infinity,
        } as Record<string, number>
      )[e.key]
      if (dy && ((dy < 0 && atTop()) || (dy > 0 && atEnd()))) api.overscroll(dy)
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('keydown', onKey)
    }
  }, [scroll.containerRef, api])

  const onChange = useCallback((fn: () => void) => {
    listeners.current.add(fn)
    return () => void listeners.current.delete(fn)
  }, [])
  return useMemo(() => ({ select: api.select, current: api.current, onChange }), [api, onChange])
}

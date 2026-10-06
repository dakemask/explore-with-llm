import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { copyText } from './clipboard'

/** Grows a textarea with its content up to `max` pixels. */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string, max = 240) {
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, max) + 'px'
  }
  useLayoutEffect(fit, [ref, value, max])
  // Its width can change too (the chat column narrows when the side-question column appears).
  const latest = useRef(fit)
  latest.current = fit
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      latest.current()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
}

/** Copies text and flips `copied` to true for a moment, for "Copied" feedback. */
export function useCopy() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async (text: string) => {
    await copyText(text)
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }
  return { copied, copy }
}

/** What `hold` keeps in place: an element, or a selector looked up in the scroll area on every frame. */
export type HoldTarget = Element | string

/** The nearest scroll area's `hold` (see `useAutoScroll`); a no-op outside one. */
export const ScrollHold = createContext<(target: HoldTarget) => void>(() => {})
export const useScrollHold = () => useContext(ScrollHold)

/** How long `hold` keeps its target in place (the change may arrive late: IndexedDB writes are async). */
const HOLD_MS = 1200

/**
 * A chat scroll area's scrolling rules:
 * - Follows the bottom while content grows, unless the user has scrolled up. Jumps to the bottom when
 *   `resetKey` changes (e.g. switching conversations).
 * - Never jumps because content got shorter: where the browser would pull the view up (the page can't
 *   scroll that far any more), blank space is added at the bottom instead. The blank goes away unnoticed:
 *   it is trimmed to what is on screen whenever the view scrolls up or content grows into it.
 * - `hold(target)` keeps what the user just clicked at its place on screen (at least at the area's top)
 *   while the change it caused lands: folding the reasoning, switching versions, a new attempt. Following
 *   the bottom afterwards (a new attempt's reply streaming in) stops once the target reaches the top, so
 *   it never scrolls out of view on its own.
 */
export function useAutoScroll(resetKey: string | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const state = useRef({
    /** Blank space at the bottom (the container's bottom padding), px. */
    blank: 0,
    /** The scroll position as last seen or set, to tell when the browser pulled it up. */
    last: 0,
    held: null as { target: HoldTarget; offset: number; until: number } | null,
    /** The last held target: following the bottom doesn't scroll it above the top. Cleared by the user scrolling. */
    cap: null as HoldTarget | null,
  })

  const api = useMemo(() => {
    const s = state.current
    const box = () => containerRef.current
    const setBlank = (el: HTMLElement, px: number) => {
      px = Math.max(0, Math.round(px))
      if (px === s.blank) return
      s.blank = px
      el.style.paddingBottom = px ? `${px}px` : ''
    }
    /** Height without the blank. */
    const natural = (el: HTMLElement) => el.scrollHeight - s.blank
    /** Scrolls to `top`, adding blank below if the page is too short for it. */
    const scrollTo = (el: HTMLElement, top: number) => {
      top = Math.max(0, Math.round(top))
      const max = el.scrollHeight - el.clientHeight
      if (top > max) setBlank(el, s.blank + top - max)
      el.scrollTop = top
      s.last = el.scrollTop
    }
    /** Drops blank that is below the screen. */
    const trim = (el: HTMLElement) => {
      if (s.blank) setBlank(el, Math.min(s.blank, el.scrollTop + el.clientHeight - natural(el)))
    }
    const find = (el: HTMLElement, target: HoldTarget) =>
      typeof target === 'string' ? el.querySelector(target) : target.isConnected ? target : null
    /** Moves the held target back to its place; ends the hold when its time is up. */
    const applyHold = (el: HTMLElement) => {
      const h = s.held
      if (!h) return false
      if (performance.now() > h.until) {
        s.held = null
        stick.current = natural(el) - el.scrollTop - el.clientHeight < 80
        return false
      }
      const t = find(el, h.target)
      if (t) {
        const delta = t.getBoundingClientRect().top - el.getBoundingClientRect().top - h.offset
        if (Math.abs(delta) >= 1) scrollTo(el, el.scrollTop + delta)
      }
      return true
    }
    /**
     * The content shrank under the view and the browser pulled it up (it's now further up and at the very
     * bottom, which scrolling up by hand never leaves it at): put it back, over blank space.
     */
    const unclamp = (el: HTMLElement) => {
      if (el.scrollTop >= s.last - 1 || el.scrollTop < el.scrollHeight - el.clientHeight - 1) return false
      scrollTo(el, s.last)
      return true
    }
    /** After any layout change: keep the held target in place, else undo a pull-up, else follow the bottom. */
    const settle = () => {
      const el = box()
      if (!el) return
      if (applyHold(el)) return
      if (!unclamp(el) && stick.current) {
        let top = Math.max(el.scrollTop, natural(el) - el.clientHeight)
        const cap = s.cap && find(el, s.cap)
        if (cap) {
          const capTop = el.scrollTop + cap.getBoundingClientRect().top - el.getBoundingClientRect().top
          top = Math.min(top, Math.max(el.scrollTop, capTop))
        }
        scrollTo(el, top)
      }
      trim(el)
    }
    const hold = (target: HoldTarget) => {
      const el = box()
      const t = el && find(el, target)
      if (!el || !t) return
      const offset = Math.max(0, t.getBoundingClientRect().top - el.getBoundingClientRect().top)
      s.held = { target, offset, until: performance.now() + HOLD_MS }
      s.cap = target
      stick.current = false
      const tick = () => {
        if (!s.held || !applyHold(el)) return
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
    return { scrollTo, trim, natural, settle, hold, setBlank, unclamp }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const s = state.current
    const onScroll = () => {
      // A pull-up can be reported here first (layout forced while rendering), before the size observer runs.
      if (!s.held && api.unclamp(el)) return
      s.last = el.scrollTop
      api.trim(el)
      if (!s.held) stick.current = api.natural(el) - el.scrollTop - el.clientHeight < 80
    }
    // The user scrolling on their own ends a hold.
    const release = () => {
      s.cap = null
      if (s.held) {
        s.held = null
        stick.current = api.natural(el) - el.scrollTop - el.clientHeight < 80
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) release()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', release, { passive: true })
    el.addEventListener('touchstart', release, { passive: true })
    // (Also dragging the scrollbar; a click that starts a new hold does so after this.)
    el.addEventListener('pointerdown', release)
    el.addEventListener('keydown', onKey)
    // Size changes of anything inside (chat, side column) and of the area itself.
    const ro = new ResizeObserver(api.settle)
    const observeChildren = () => {
      ro.disconnect()
      ro.observe(el)
      for (const child of el.children) ro.observe(child)
    }
    observeChildren()
    const mo = new MutationObserver(observeChildren)
    mo.observe(el, { childList: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', release)
      el.removeEventListener('touchstart', release)
      el.removeEventListener('pointerdown', release)
      el.removeEventListener('keydown', onKey)
      ro.disconnect()
      mo.disconnect()
    }
  }, [api])

  useEffect(() => {
    stick.current = true
    const el = containerRef.current
    state.current.held = null
    state.current.cap = null
    if (!el) return
    api.setBlank(el, 0)
    el.scrollTop = el.scrollHeight
    state.current.last = el.scrollTop
  }, [resetKey, api])

  const pin = () => {
    state.current.held = null
    state.current.cap = null
    stick.current = true
  }
  /** Stop following the bottom and holding anything (before scrolling somewhere else on purpose). */
  const unpin = () => {
    state.current.held = null
    state.current.cap = null
    stick.current = false
  }

  return { containerRef, contentRef, pin, unpin, hold: api.hold }
}

const gliding = new WeakMap<HTMLElement, object>()

/**
 * Scrolls `el` to `top` in a short ease-out (250 ms). From far away it first jumps to within part of a
 * screen of the target, so long distances don't turn into a long animation.
 */
export function glideTo(el: HTMLElement, top: number) {
  // A newer glide on the same element takes over.
  const token = {}
  gliding.set(el, token)
  const end = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight))
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.scrollTop = end
    return
  }
  const reach = el.clientHeight * 0.6
  if (Math.abs(end - el.scrollTop) > reach) el.scrollTop = end - Math.sign(end - el.scrollTop) * reach
  const start = el.scrollTop
  const t0 = performance.now()
  const step = (now: number) => {
    if (gliding.get(el) !== token) return
    const p = Math.min(1, (now - t0) / 250)
    el.scrollTop = start + (end - start) * (1 - (1 - p) ** 3)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

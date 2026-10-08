import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
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
/**
 * Keeps `target` at its place on screen while the change the user just caused lands. `follow`: a new
 * reply is coming (retry / edit): follow it afterwards, but never scroll the target above the top.
 */
export type Hold = (target: HoldTarget, opts?: { follow?: boolean }) => void

/** The nearest scroll area's `hold` (see `useAutoScroll`); a no-op outside one. */
export const ScrollHold = createContext<Hold>(() => {})
export const useScrollHold = () => useContext(ScrollHold)

/** How long `hold` keeps its target in place (the change may arrive late: IndexedDB writes are async). */
const HOLD_MS = 1200
/** Within this distance of the end of the content, a scroll by the user turns following on. */
const NEAR_END = 40

/**
 * A chat scroll area's scrolling rules (the main chat and each side card's messages), all here:
 * 1. The view moves on its own only while *following*: then it keeps the end of the content in view as it
 *    grows. Anything else that changes size leaves what's on screen where it is.
 * 2. Following turns on when the user sends (`pin`) or retries / edits (`hold` with `follow`), when
 *    `resetKey` changes (another conversation: it jumps to the end) and when the user scrolls to the end;
 *    it turns off when the user scrolls away from the end, clicks something that holds (a reasoning
 *    toggle, the switcher) or drags out a text selection in the area. Nothing else changes it — content
 *    getting shorter doesn't.
 * 3. Never pulled up: where content got shorter at the end and the browser would pull the view up, blank
 *    space is added at the bottom instead; it is trimmed away unnoticed (whatever of it is below the screen,
 *    on every scroll and size change).
 * 4. `hold(target)` keeps what the user just clicked in place (at least at the top) for a moment: folding
 *    the reasoning, switching versions, a new attempt. The user scrolling ends it at once.
 * "The content" is `contentRef` (in the main chat: the messages, not the side column beside them). The blank
 * is `blankRef`'s bottom padding: a wrapper of everything inside the area (padding on the area itself would
 * make the area taller, pushing what's below it — the composer — off screen).
 */
export function useAutoScroll(resetKey: string | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const blankRef = useRef<HTMLDivElement>(null)
  const state = useRef({
    following: true,
    /** Blank space at the bottom (`blankRef`'s bottom padding), px. */
    blank: 0,
    /** Until then (or the user scrolls), the view is kept at the end: another conversation's messages load. */
    resetUntil: 0,
    /** The scroll position this hook last saw or set: a scroll event elsewhere is the user's (or a pull-up). */
    last: 0,
    held: null as { target: HoldTarget; offset: number; until: number } | null,
    /** After a retry / edit: following doesn't scroll this above the top. Cleared by the user scrolling. */
    cap: null as HoldTarget | null,
    /** The mouse button is down after a press in the area. */
    pressed: false,
  })
  /** Told whenever the user scrolls by hand (`onUserScroll`). */
  const userScrollListeners = useRef(new Set<() => void>())

  const api = useMemo(() => {
    const s = state.current
    const setBlank = (px: number) => {
      px = Math.max(0, Math.round(px))
      if (px === s.blank || !blankRef.current) return
      s.blank = px
      blankRef.current.style.paddingBottom = px ? `${px}px` : ''
    }
    /** Scrolls to `top`, adding blank below if the area is too short for it. */
    const scrollTo = (el: HTMLElement, top: number) => {
      top = Math.max(0, Math.round(top))
      const max = el.scrollHeight - el.clientHeight
      if (top > max) setBlank(s.blank + top - max)
      el.scrollTop = top
      s.last = el.scrollTop
    }
    /** Drops the blank that is below the screen. */
    const trim = (el: HTMLElement) => {
      if (s.blank) setBlank(Math.min(s.blank, el.scrollTop + el.clientHeight - (el.scrollHeight - s.blank)))
    }
    /** Where `node` is, in the area's scroll coordinates. */
    /** Includes what belongs above it (its `scroll-margin-top`, e.g. a node's header on its frame's border). */
    const topOf = (el: HTMLElement, node: Element) =>
      node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - marginTop(node)
    /** The end of the content, in the area's scroll coordinates. */
    const end = (el: HTMLElement) => {
      const c = contentRef.current
      return c ? c.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop : el.scrollHeight - s.blank
    }
    const find = (el: HTMLElement, target: HoldTarget) =>
      typeof target === 'string' ? el.querySelector(target) : target.isConnected ? target : null

    /** Puts the held target back at its place; false once there's no hold (any more). */
    const applyHold = (el: HTMLElement) => {
      const h = s.held
      if (!h) return false
      if (performance.now() > h.until) {
        s.held = null
        return false
      }
      const t = find(el, h.target)
      if (t) {
        const delta = topOf(el, t) - el.scrollTop - h.offset
        if (Math.abs(delta) >= 1) scrollTo(el, el.scrollTop + delta)
      }
      return true
    }
    /**
     * The browser pulled the view up because content shrank (it's now further up and at the very bottom,
     * which scrolling up by hand never leaves it at): put it back, over blank space.
     */
    const unclamp = (el: HTMLElement) => {
      if (el.scrollTop >= s.last - 1 || el.scrollTop < el.scrollHeight - el.clientHeight - 1) return false
      scrollTo(el, s.last)
      return true
    }
    /** The user is dragging out a text selection in the area (following would pull the text from under the mouse). */
    const selecting = (el: HTMLElement) => {
      if (!s.pressed) return false
      const sel = getSelection()
      return !!sel && !sel.isCollapsed && !!sel.anchorNode && el.contains(sel.anchorNode)
    }
    const follow = (el: HTMLElement) => {
      if (selecting(el)) return void (s.following = false)
      let top = Math.max(el.scrollTop, end(el) - el.clientHeight)
      const cap = s.cap && find(el, s.cap)
      if (cap) top = Math.min(top, Math.max(el.scrollTop, topOf(el, cap)))
      if (top > el.scrollTop + 0.5) scrollTo(el, top)
    }
    /** Just after a reset: straight to the end, as the new messages come in (no blank, no pull-up checks). */
    const toEnd = (el: HTMLElement) => {
      setBlank(0)
      el.scrollTop = Math.max(0, end(el) - el.clientHeight)
      s.last = el.scrollTop
    }
    /** After any size change: hold, else undo a pull-up, else follow (rule 1), then trim. */
    const settle = () => {
      const el = containerRef.current
      if (!el) return
      if (performance.now() < s.resetUntil) return toEnd(el)
      if (!applyHold(el) && !unclamp(el) && s.following) follow(el)
      trim(el)
    }
    const onScroll = () => {
      const el = containerRef.current
      if (!el || Math.abs(el.scrollTop - s.last) < 1) return // our own scroll
      if (performance.now() < s.resetUntil) return toEnd(el)
      if (s.held) return void applyHold(el) // (something scrolled in the middle of a hold: back in place)
      if (unclamp(el)) return // (reported here when layout ran before the size observer did)
      s.last = el.scrollTop
      trim(el)
      s.following = end(el) - el.scrollTop - el.clientHeight < NEAR_END
    }
    /** The user scrolls by hand: a hold or a cap ends (the scroll event then decides about following). */
    const release = () => {
      s.held = null
      s.cap = null
      s.resetUntil = 0
      for (const fn of userScrollListeners.current) fn()
    }
    const hold: Hold = (target, opts) => {
      const el = containerRef.current
      const t = el && find(el, target)
      if (!el || !t) return
      const offset = Math.max(0, topOf(el, t) - el.scrollTop)
      s.held = { target, offset, until: performance.now() + HOLD_MS }
      // A new reply: follow it (capped). Anything else the user clicked (a toggle, the switcher) means they
      // are reading what's on screen: stop following, or the view would jump to the end once the hold is over.
      s.following = !!opts?.follow
      s.cap = opts?.follow ? target : null
      // Every frame (the change may be a re-render without any size change in the observed boxes).
      const tick = () => {
        if (s.held && applyHold(el)) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
    const reset = () => {
      const el = containerRef.current
      Object.assign(s, { following: true, held: null, cap: null, resetUntil: performance.now() + 1000 })
      if (el) toEnd(el)
    }
    return { settle, onScroll, release, hold, reset }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) api.release()
    }
    el.addEventListener('scroll', api.onScroll, { passive: true })
    el.addEventListener('wheel', api.release, { passive: true })
    el.addEventListener('touchstart', api.release, { passive: true })
    // Pressing on the scrollbar (its events target the area itself); a click on the content isn't scrolling.
    const onPointer = (e: PointerEvent) => {
      if (e.target === el) api.release()
      else if (e.button === 0) state.current.pressed = true
    }
    const onUp = () => {
      state.current.pressed = false
    }
    el.addEventListener('pointerdown', onPointer)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    el.addEventListener('keydown', onKey)
    // Size changes of the area, the content, and whatever else sits in the wrapper (the side column).
    const ro = new ResizeObserver(api.settle)
    const wrapper = blankRef.current ?? el
    const observeChildren = () => {
      ro.disconnect()
      ro.observe(el)
      if (contentRef.current) ro.observe(contentRef.current)
      for (const child of wrapper.children) ro.observe(child)
    }
    observeChildren()
    const mo = new MutationObserver(observeChildren)
    mo.observe(wrapper, { childList: true })
    return () => {
      el.removeEventListener('scroll', api.onScroll)
      el.removeEventListener('wheel', api.release)
      el.removeEventListener('touchstart', api.release)
      el.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.removeEventListener('keydown', onKey)
      ro.disconnect()
      mo.disconnect()
    }
  }, [api])

  useEffect(api.reset, [resetKey, api])

  /** The user sends: follow the new reply. */
  const pin = () => {
    Object.assign(state.current, { following: true, held: null, cap: null })
  }
  /** Stop following and holding (before scrolling somewhere else on purpose). */
  const unpin = () => {
    Object.assign(state.current, { following: false, held: null, cap: null })
  }

  /** Calls `fn` whenever the user scrolls by hand (wheel, touch, scroll keys, the scrollbar); returns the unsubscribe. */
  const onUserScroll = useCallback((fn: () => void) => {
    userScrollListeners.current.add(fn)
    return () => void userScrollListeners.current.delete(fn)
  }, [])

  return { containerRef, contentRef, blankRef, pin, unpin, hold: api.hold, onUserScroll }
}

const gliding = new WeakMap<HTMLElement, object>()

/**
 * Scrolls `el` to `top` in a short ease-out (250 ms). From far away it first jumps to within part of a
 * screen of the target, so long distances don't turn into a long animation.
 */
/** An element's `scroll-margin-top`: room above it that belongs to it when it's brought to the top. */
export const marginTop = (node: Element) => parseFloat(getComputedStyle(node).scrollMarginTop) || 0

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

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { copyText } from './clipboard'

/** Grows a textarea with its content up to `max` pixels. */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string, max = 240) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, max) + 'px'
  }, [ref, value, max])
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

/**
 * Keeps the view pinned to the bottom while content grows, unless the user has scrolled up.
 * Jumps to the bottom when `resetKey` changes (e.g. switching conversations).
 */
export function useAutoScroll(resetKey: string | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    const content = contentRef.current
    if (!el || !content) return
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    stick.current = true
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [resetKey])

  const pin = () => {
    stick.current = true
  }
  /** Stop following the bottom (before scrolling somewhere else on purpose). */
  const unpin = () => {
    stick.current = false
  }

  return { containerRef, contentRef, pin, unpin }
}

/**
 * Scrolls `el` to `top` in a short ease-out (250 ms). From far away it first jumps to within part of a
 * screen of the target, so long distances don't turn into a long animation.
 */
export function glideTo(el: HTMLElement, top: number) {
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
    const p = Math.min(1, (now - t0) / 250)
    el.scrollTop = start + (end - start) * (1 - (1 - p) ** 3)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

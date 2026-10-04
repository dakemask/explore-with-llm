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

  return { containerRef, contentRef, pin }
}

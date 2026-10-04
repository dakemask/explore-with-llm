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

import { useLayoutEffect, type RefObject } from 'react'

/** Grows a textarea with its content up to `max` pixels. */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string, max = 240) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, max) + 'px'
  }, [ref, value, max])
}

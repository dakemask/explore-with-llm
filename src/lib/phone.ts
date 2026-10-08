/**
 * Phone layout (Product decisions › Phone): narrow screens get it, everything wider keeps the desktop one.
 * `usePhone` follows the window (rotating, resizing); `isPhone` reads it once (for event handlers).
 */
import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 640px)'
const mq = typeof matchMedia === 'function' ? matchMedia(QUERY) : null

export const isPhone = () => !!mq?.matches

const subscribe = (cb: () => void) => {
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}

export function usePhone() {
  return useSyncExternalStore(subscribe, isPhone)
}

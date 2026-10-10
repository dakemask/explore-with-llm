import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import type { ChatNode } from '../db'
import { branchesOf, siblingsOf } from './tree'

/**
 * Switch animations (task 19, owner, 2026-10-08) for a chat scroll area (the main chat and each side card).
 * Switching at a fork shows what's below it in a new version: the moment the user clicks, what will change
 * (the fork turn's body, every turn below it, their side cards and bars) is copied into a snapshot overlay —
 * a picture, not interactive —; once the new version is rendered, the snapshot moves out while the new content
 * moves in: sideways between siblings (`dir` +1 = the new one comes from the right, -1 from the left), a plain
 * crossfade otherwise (`dir` 0: a tree map jump to a cousin, and always with reduced motion). The fork turn's
 * frame moves with its text (owner, 2026-10-10; it used to stay), its header stays (the switcher animates on
 * its own). Heights snap; only transforms and opacity animate, so layout and scrolling (`useAutoScroll`) see
 * nothing of it.
 */
export interface SwitchMotion {
  /** Call right before the switch at fork `key` that will show node `to`. */
  begin: (key: string, to: string, dir: number) => void
}

const DX = 40
const IN_MS = 260
const OUT_MS = 200
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
/** A switch whose new version doesn't show up within this long is dropped (the snapshot goes). */
const WAIT_MS = 1500
/** Attributes the app finds things by: a snapshot must never be found instead of the real thing. */
const STRIP = ['id', 'data-turn', 'data-fork', 'data-node', 'data-switcher', 'data-reply', 'data-anchor-root', 'data-anchor-target', 'data-card', 'data-item', 'data-expanded', 'data-composer']

/**
 * A lifeless picture of `el` for an animation: a deep copy without the attributes the app finds things by
 * and without entry animations. `scrolled` (after the copy is in the page) gives its insides `el`'s scroll
 * positions (an expanded card's messages are scrolled: so is its picture).
 */
export function snapshot(el: HTMLElement) {
  const copy = el.cloneNode(true) as HTMLElement
  for (const node of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    for (const name of STRIP) node.removeAttribute(name)
    // (Entry animations would play again.)
    for (const c of [...node.classList]) if (c.startsWith('anim-')) node.classList.remove(c)
  }
  const inner = [...el.querySelectorAll<HTMLElement>('*')]
  const copies = [...copy.querySelectorAll<HTMLElement>('*')]
  const tops = inner.flatMap((n, i) => (n.scrollTop ? [[copies[i], n.scrollTop] as const] : []))
  return { copy, scrolled: () => tops.forEach(([n, top]) => (n.scrollTop = top)) }
}

/** The direction of a switch from `from` to its sibling `to`, by the switcher's order (branches, then attempts). */
export function switchDir(nodes: ChatNode[], from: ChatNode, to: string) {
  const sibs = siblingsOf(nodes, from)
  const order = from.kind === 'side' ? sibs : [...branchesOf(sibs), ...sibs.filter((s) => !s.branch)]
  const a = order.findIndex((s) => s.id === from.id)
  const b = order.findIndex((s) => s.id === to)
  return a < 0 || b < 0 ? 0 : Math.sign(b - a)
}

/**
 * `area`: the scroll area's refs (`useAutoScroll`); `wrapper` (its `blankRef`, `position: relative`) holds the
 * snapshot, `content` the turns. A side column inside the wrapper (`data-side-column`) takes part.
 * `path` = the shown path (a new one may be the switch arriving); `resetKey` change (another conversation /
 * thread) drops a running switch.
 */
export function useSwitchMotion(
  area: { blankRef: RefObject<HTMLElement | null>; contentRef: RefObject<HTMLElement | null> },
  path: unknown,
  resetKey: unknown,
): SwitchMotion {
  const state = useRef({
    pending: null as null | {
      key: string
      to: string
      dir: number
      overlay: HTMLElement
      under: HTMLElement | null
      top: number
      timer: number
    },
    overlay: null as HTMLElement | null,
    /** The old frame of a framed fork turn (see `begin`). */
    under: null as HTMLElement | null,
    running: [] as Animation[],
  })

  const api = useMemo(() => {
    const s = state.current
    /** Ends whatever runs at once: the new content as it is, no snapshot. */
    const finish = () => {
      for (const a of s.running) a.cancel()
      s.running = []
      if (s.pending) clearTimeout(s.pending.timer)
      s.pending = null
      s.overlay?.remove()
      s.overlay = null
      s.under?.remove()
      s.under = null
    }

    /** The fork turn's body and every turn below it, plus the side column's items anchored there (top ≥ `top`). */
    const parts = (key: string, top?: number) => {
      const wrapper = area.blankRef.current
      const content = area.contentRef.current
      const fork = content?.querySelector<HTMLElement>(`[data-fork="${CSS.escape(key)}"]`)
      const turn = fork?.parentElement
      if (!wrapper || !fork || !turn) return null
      const base = wrapper.getBoundingClientRect()
      const at = top ?? turn.getBoundingClientRect().top - base.top
      const els: HTMLElement[] = []
      const body = fork.querySelector<HTMLElement>(':scope > [data-node-body]')
      if (body) els.push(body)
      for (let el = turn.nextElementSibling; el; el = el.nextElementSibling) els.push(el as HTMLElement)
      const column = wrapper.querySelector<HTMLElement>(':scope > [data-side-column]')
      if (column) {
        const ids = new Set(
          [...column.querySelectorAll<HTMLElement>('[data-item]')]
            .filter((bar) => bar.getBoundingClientRect().top - base.top >= at - 1)
            .map((bar) => bar.dataset.item),
        )
        for (const el of column.querySelectorAll<HTMLElement>('[data-item], [data-card], [data-expanded]')) {
          if (ids.has(el.dataset.item ?? el.dataset.card ?? el.dataset.expanded)) els.push(el)
        }
      }
      return { wrapper, fork, base, top: at, els }
    }

    const begin = (key: string, to: string, dir: number) => {
      finish()
      const found = parts(key)
      if (!found) return
      const { wrapper, base, top, els } = found
      const overlay = document.createElement('div')
      overlay.setAttribute('aria-hidden', 'true')
      overlay.inert = true
      // `clip`, not `hidden`: a hidden overflow would be a scroll container and break the sticky reasoning toggles.
      overlay.style.cssText = 'position:absolute;inset:0;overflow:clip;pointer-events:none'
      const scrolled: (() => void)[] = []
      for (const el of els) {
        const r = el.getBoundingClientRect()
        const snap = snapshot(el)
        const copy = snap.copy
        Object.assign(copy.style, {
          position: 'absolute',
          margin: '0',
          left: `${r.left - base.left}px`,
          top: `${r.top - base.top}px`,
          right: 'auto',
          bottom: 'auto',
          width: `${r.width}px`,
          height: `${r.height}px`,
          transition: 'none',
        })
        overlay.append(copy)
        if (el.dataset.expanded) scrolled.push(snap.scrolled)
      }
      wrapper.append(overlay)
      for (const restore of scrolled) restore()
      // A framed turn (main chat): its frame moves too, the header stays (owner, 2026-10-10). The old frame
      // goes in an overlay of its own, first in the wrapper, so it passes under the header, which hides the
      // line behind it.
      const turn = found.fork.parentElement
      if (turn?.dataset.framed !== undefined) {
        const r = turn.getBoundingClientRect()
        const frame = turn.cloneNode(false) as HTMLElement
        for (const name of [...frame.getAttributeNames()]) if (name !== 'class') frame.removeAttribute(name)
        Object.assign(frame.style, {
          position: 'absolute',
          margin: '0',
          left: `${r.left - base.left}px`,
          top: `${r.top - base.top}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
        })
        const under = overlay.cloneNode(false) as HTMLElement
        under.inert = true
        under.setAttribute('data-frame-copy', '')
        under.append(frame)
        wrapper.prepend(under)
        s.under = under
      }
      s.overlay = overlay
      s.pending = { key, to, dir, overlay, under: s.under, top, timer: window.setTimeout(finish, WAIT_MS) }
    }

    /** The new version is rendered (if it's the awaited one): animate. */
    const play = () => {
      const p = s.pending
      if (!p) return
      const found = parts(p.key, p.top)
      if (!found || found.fork.dataset.node !== p.to) return
      clearTimeout(p.timer)
      s.pending = null
      const dx = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : p.dir * DX
      const shift = (x: number) => (x ? [{ transform: `translateX(${x}px)` }, { transform: 'none' }] : [{}, {}])
      const [from, to] = shift(dx)
      const turn = found.fork.parentElement
      const framed = turn?.dataset.framed !== undefined
      for (const el of found.els) {
        // (A framed turn's body moves with its frame.)
        const move = framed && el.parentElement === found.fork ? [{}, {}] : [from, to]
        s.running.push(el.animate([{ ...move[0], opacity: 0 }, { ...move[1], opacity: 1 }], { duration: IN_MS, easing: EASE }))
      }
      if (framed && dx) {
        // The frame slides in; its header moves back just as much, so it stays.
        const header = found.fork.querySelector<HTMLElement>(':scope > [data-node-header]')
        s.running.push(turn!.animate([from, to], { duration: IN_MS, easing: EASE }))
        if (header) s.running.push(header.animate(shift(-dx), { duration: IN_MS, easing: EASE }))
      }
      const under = p.under
      if (under) {
        const gone = under.animate([{ opacity: 1 }, { ...(dx ? { transform: `translateX(${-dx}px)` } : {}), opacity: 0 }], {
          duration: OUT_MS,
          easing: EASE,
          fill: 'forwards',
        })
        s.running.push(gone)
        gone.onfinish = () => {
          under.remove()
          if (s.under === under) s.under = null
        }
      }
      const out = p.overlay.animate(
        [{ opacity: 1 }, { ...(dx ? { transform: `translateX(${-dx}px)` } : {}), opacity: 0 }],
        { duration: OUT_MS, easing: EASE, fill: 'forwards' },
      )
      s.running.push(out)
      out.onfinish = () => {
        p.overlay.remove()
        if (s.overlay === p.overlay) s.overlay = null
      }
    }
    return { begin, finish, play }
    // (The refs are stable.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After every render with a new path: the switch may have arrived. Run once React is done with this update
  // (the side column measures and places its cards in follow-up renders of the same update), before the paint.
  useLayoutEffect(() => {
    if (state.current.pending) queueMicrotask(api.play)
  }, [path, api])
  useLayoutEffect(() => api.finish, [resetKey, api])

  return useMemo(() => ({ begin: api.begin }), [api])
}

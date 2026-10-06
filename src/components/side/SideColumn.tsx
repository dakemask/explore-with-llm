import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { CARD_HEIGHT, coveredCards, markerLanes, stackCards, type Span } from '../../lib/column'
import { glideTo } from '../../lib/hooks'
import { Tip } from '../ui/Button'

/**
 * One item of the column: something anchored to a stretch of the chat text, shown as a collapsed card
 * (title + meta) or expanded (`renderExpanded`). Side questions now; notes (step 6.5) plug in as another kind.
 */
export interface ColumnItem {
  id: string
  kind: 'side' | 'note'
  /** The id its highlight carries in `data-threads` (where it is measured). */
  mark: string
  title: ReactNode
  /** Small muted text at the card's right (e.g. the turn count). */
  meta: string
  /** The marker bar's tip. */
  tip: string
}

/** The marker strip's width (cards start right of it). */
const STRIP = 22
/** Cards sit this much above their anchor's first line, so their title lines up with it. */
const LIFT = 9

/** Marker bar colors per kind: resting (deepens on hover), lit (its card is hovered or expanded). */
const barClass = {
  side: ['bg-mark-side group-hover/bar:bg-mark-side-strong', 'bg-mark-side-strong'],
  note: ['bg-mark-note group-hover/bar:bg-mark-note-strong', 'bg-mark-note-strong'],
}

/**
 * The column right of the chat, inside the chat's scroll area. Collapsed cards sit level with their
 * anchors (pushed down only to avoid overlapping); the expanded one sits at its anchor and covers what it
 * overlaps; the marker strip shows every anchor's lines. Positions are measured from the highlights in
 * `content` and follow its size changes (streaming text, images, window width).
 */
export function SideColumn({
  items,
  width,
  content,
  scroller,
  expanded,
  hover,
  onHover,
  onExpand,
  renderExpanded,
}: {
  items: ColumnItem[]
  width: number
  /** The chat content holding the highlights. */
  content: RefObject<HTMLElement | null>
  /** The scroll area (to bring an expanded card into view). */
  scroller: RefObject<HTMLElement | null>
  expanded: string | null
  /** Items hovered here or in the text (their cards and bars light up). */
  hover: string[]
  onHover: (ids: string[]) => void
  onExpand: (id: string) => void
  renderExpanded: (id: string, card: RefObject<HTMLDivElement | null>) => ReactNode
}) {
  const colRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const spans = useSpans(items, content, colRef)

  const placed = items
    .filter((it) => spans[it.id])
    .sort((a, b) => spans[a.id].top - spans[b.id].top || spans[a.id].bottom - spans[b.id].bottom)
  const tops = stackCards(placed.map((it) => Math.max(0, spans[it.id].top - LIFT)))
  // (Its item can be gone for a render before its span is: `items` decides.)
  const open =
    expanded && spans[expanded] && placed.some((it) => it.id === expanded) ? Math.max(0, spans[expanded].top - LIFT) : null
  const cardHeight = useHeight(cardRef, open === null ? null : expanded)
  // At most 75% of the window, and never taller than the scroll area, so its composer can always be seen.
  const viewHeight = useHeight(scroller, null)
  const maxHeight = `min(75vh, ${Math.max(240, viewHeight - 32)}px)`
  const hidden = new Set(
    open === null ? [] : [expanded!, ...coveredCards(tops, open, open + cardHeight).map((i) => placed[i].id)],
  )
  const { lanes, count } = markerLanes(placed.map((it) => spans[it.id]))
  const laneWidth = Math.min(6, (STRIP - 6) / Math.max(1, count))
  const extent = Math.max(0, ...tops.map((t) => t + CARD_HEIGHT), open === null ? 0 : open + cardHeight) + 32

  // Bring a card into view when it expands (its anchor may be off screen, or the card runs past the bottom),
  // and keep its bottom (the composer) in view while it grows, if it was in view. `follow` stays on across
  // growth steps (one may come while the last glide is still under way) until the user scrolls by hand.
  const shown = useRef<{ id: string; height: number; follow: boolean } | null>(null)
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const stop = () => {
      if (shown.current) shown.current.follow = false
    }
    box.addEventListener('wheel', stop, { passive: true })
    box.addEventListener('touchstart', stop, { passive: true })
    return () => {
      box.removeEventListener('wheel', stop)
      box.removeEventListener('touchstart', stop)
    }
  }, [scroller])
  useEffect(() => {
    const box = scroller.current
    const card = cardRef.current
    if (!expanded || !box || !card || !cardHeight) {
      if (!expanded) shown.current = null
      return
    }
    const last = shown.current?.id === expanded ? shown.current : null
    const view = box.getBoundingClientRect()
    const r = card.getBoundingClientRect()
    const margin = 16
    const below = r.bottom - (view.bottom - margin)
    const grew = !!last && cardHeight > last.height
    let delta = 0
    if (!last && r.top < view.top + margin) delta = r.top - view.top - margin
    else if (below > 0 && (!last || (grew && (last.follow || below <= cardHeight - last.height + 1))))
      delta = Math.min(below, r.top - view.top - margin)
    shown.current = { id: expanded, height: cardHeight, follow: below - delta <= 1 || (!!last?.follow && !grew) }
    if (Math.abs(delta) > 1) glideTo(box, box.scrollTop + delta)
  }, [expanded, cardHeight, scroller])

  return (
    <div ref={colRef} data-side-column className="relative shrink-0" style={{ width, height: extent }}>
      {placed.map((it, i) => {
        const span = spans[it.id]
        const lit = hover.includes(it.id) || it.id === expanded
        return (
          <Tip key={it.id} content={it.tip}>
            <button
              aria-label={it.tip}
              onClick={() => onExpand(it.id)}
              onMouseEnter={() => onHover([it.id])}
              onMouseLeave={() => onHover([])}
              className="group/bar absolute flex justify-center rounded-sm transition-[top,height] duration-200 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
              style={{ top: span.top, height: span.bottom - span.top, left: 6 + lanes[i] * laneWidth, width: laneWidth }}
            >
              <span className={clsx('h-full w-[3px] rounded-full transition-colors', barClass[it.kind][lit ? 1 : 0])} />
            </button>
          </Tip>
        )
      })}

      {placed.map((it, i) => {
        const covered = hidden.has(it.id)
        const lit = hover.includes(it.id)
        return (
          <button
            key={it.id}
            tabIndex={covered ? -1 : undefined}
            aria-hidden={covered || undefined}
            onClick={() => onExpand(it.id)}
            onMouseEnter={() => onHover([it.id])}
            onMouseLeave={() => onHover([])}
            className={clsx(
              'absolute right-3 flex items-center gap-2 rounded-lg border bg-surface px-3 text-left text-[13px] shadow-xs',
              'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
              'transition-[top,opacity,border-color,background-color] duration-200',
              lit ? 'border-border-strong' : 'border-border hover:border-border-strong',
              covered && 'pointer-events-none opacity-0',
            )}
            style={{ top: tops[i], left: STRIP, height: CARD_HEIGHT }}
          >
            <span className="flex min-w-0 flex-1 items-center">{it.title}</span>
            <span className="shrink-0 text-[11px] text-faint tabular-nums">{it.meta}</span>
          </button>
        )
      })}

      {open !== null && (
        <div
          ref={cardRef}
          key={expanded}
          className="anim-fade absolute right-3 z-10 flex flex-col rounded-xl border border-border-strong bg-surface shadow-pop transition-[top] duration-200"
          style={{ top: open, left: STRIP, maxHeight }}
          onMouseEnter={() => onHover([expanded!])}
          onMouseLeave={() => onHover([])}
        >
          {renderExpanded(expanded!, cardRef)}
        </div>
      )}
    </div>
  )
}

/**
 * Each item's anchor (top of its first line → bottom of its last), relative to the column's top, which
 * is level with the chat content's. Re-measured when the items change and whenever the content resizes;
 * an item whose highlight is missing for a moment (its reply is being edited) keeps its last position.
 */
function useSpans(items: ColumnItem[], content: RefObject<HTMLElement | null>, col: RefObject<HTMLElement | null>) {
  const [spans, setSpans] = useState<Record<string, Span>>({})
  const latest = useRef(items)
  latest.current = items
  const key = items.map((it) => it.id + '=' + it.mark).join(' ')

  useLayoutEffect(() => {
    const root = content.current
    if (!root) return
    const measure = () => {
      const base = col.current?.getBoundingClientRect().top
      if (base === undefined) return
      setSpans((prev) => {
        const next: Record<string, Span> = {}
        let changed = Object.keys(prev).length !== latest.current.length
        for (const it of latest.current) {
          let top = Infinity
          let bottom = -Infinity
          for (const el of root.querySelectorAll(`[data-threads~="${CSS.escape(it.mark)}"]`)) {
            for (const r of el.getClientRects()) {
              if (!r.height) continue
              top = Math.min(top, r.top)
              bottom = Math.max(bottom, r.bottom)
            }
          }
          const span = top < Infinity ? { top: Math.round(top - base), bottom: Math.round(bottom - base) } : prev[it.id]
          if (!span) {
            changed ||= it.id in prev
            continue
          }
          next[it.id] = span
          changed ||= prev[it.id]?.top !== span.top || prev[it.id]?.bottom !== span.bottom
        }
        return changed ? next : prev
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [key, content, col])

  return spans
}

/** The height of the element in `ref` (0 when there is none), following its size. `key` = when it may have changed. */
function useHeight(ref: RefObject<HTMLElement | null>, key: unknown) {
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return setHeight(0)
    const update = () => setHeight(Math.round(el.getBoundingClientRect().height))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, key])
  return height
}

import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { CARD_HEIGHT, coveredCards, markerLanes, stackCards, STRIP, type Span } from '../../lib/column'
import { snapshot } from '../../lib/switchMotion'
import { Tip } from '../ui/Button'
import { Layer } from '../ui/Layer'

/**
 * One item of the column: something anchored to a stretch of the chat text, shown as a collapsed card
 * (title + its ⋯ menu) or expanded (`renderExpanded`). Side questions now; notes (step 6.5) plug in as another kind.
 */
export interface ColumnItem {
  id: string
  kind: 'side' | 'note'
  /** The main node it sits on (its color: `colorOf`). */
  nodeId: string
  /** The id its highlight carries in `data-threads` (where it is measured). */
  mark: string
  title: ReactNode
  /** The marker bar's tip. */
  tip: string
}

/** How long an item's card, bar and highlight take to fade out before it leaves (`leaving`). */
export const LEAVE_MS = 200

/** Cards sit this much above their anchor's first line, so their title lines up with it. */
const LIFT = 9

/** Sets `--node` (the item's node color: its bar, card icon) on an element's style. */
const nodeStyle = (color: string, style: CSSProperties) => ({ ...style, '--node': color }) as CSSProperties

/**
 * The column right of the chat, inside the chat's scroll area. Collapsed cards sit level with their
 * anchors (pushed down only to avoid overlapping); the expanded one sits at its anchor and covers what it
 * overlaps; the marker strip shows every anchor's lines. Positions are measured from the highlights in
 * `content` and follow its size changes (streaming text, images, window width).
 */
export function SideColumn({
  items,
  colorOf,
  width,
  content,
  scroller,
  collapsed,
  slide,
  expanded,
  leaving,
  hover,
  onHover,
  onToggle,
  onEscape,
  renderExpanded,
  renderMenu,
}: {
  items: ColumnItem[]
  /** A node's branch color (CSS value). */
  colorOf: (nodeId: string) => string
  width: number
  /** The chat content holding the highlights. */
  content: RefObject<HTMLElement | null>
  /** The scroll area (an expanded card is never taller than it). */
  scroller: RefObject<HTMLElement | null>
  /** Only the marker strip shows (the user collapsed the column). */
  collapsed: boolean
  /** Its width is animating (the column opens / closes). */
  slide: boolean
  expanded: string | null
  /** Items fading out before they leave (their card, expanded or not, and bar). */
  leaving: Record<string, true>
  /** Items hovered here or in the text (their cards and bars light up). */
  hover: string[]
  onHover: (ids: string[]) => void
  /** A bar or collapsed card was clicked: expand its card, or collapse it if it's the expanded one. */
  onToggle: (id: string) => void
  /** Escape while the expanded card is the topmost layer (`preventDefault()` = handled). */
  onEscape: (e: KeyboardEvent) => void
  renderExpanded: (id: string, card: RefObject<HTMLDivElement | null>) => ReactNode
  /** A collapsed card's ⋯ menu (`CardMenu`, given `className`), or nothing. */
  renderMenu: (id: string, className: string) => ReactNode
}) {
  const colRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const spans = useSpans(items, content, colRef)

  const placed = items
    .filter((it) => spans[it.id])
    .sort((a, b) => spans[a.id].top - spans[b.id].top || spans[a.id].bottom - spans[b.id].bottom)
  const tops = stackCards(placed.map((it) => Math.max(0, spans[it.id].top - LIFT)))
  // At most 75% of the window, and never taller than the scroll area, so its composer can always be seen.
  // Every expanded card always has this height (its messages / note text scroll inside), so a growing reply
  // or a note being typed never changes the page.
  const viewHeight = useHeight(scroller, null)
  const cardLimit = Math.round(Math.min(window.innerHeight * 0.75, Math.max(240, viewHeight - 32)))
  // Expanding never scrolls the page (owner). A card that wouldn't fit on screen below its anchor opens
  // shifted up by just enough (fixed once open; it then follows its anchor as content resizes).
  const [lift, setLift] = useState<{ id: string; px: number } | null>(null)
  const anchorTop = expanded && spans[expanded] ? Math.max(0, spans[expanded].top - LIFT) : null
  useLayoutEffect(() => {
    if (!expanded) return void (lift && setLift(null))
    if (anchorTop === null || lift?.id === expanded) return
    const col = colRef.current?.getBoundingClientRect()
    const view = scroller.current?.getBoundingClientRect()
    if (!col || !view) return
    const room = view.bottom - col.top - 16 - anchorTop // from the card's top to the screen's bottom edge
    const px = Math.max(0, Math.min(cardLimit - room, anchorTop - (view.top - col.top) - 16))
    setLift({ id: expanded, px })
  }, [expanded, anchorTop, lift, cardLimit, scroller])
  // (Its item can be gone for a render before its span is: `items` decides. The card first renders once
  // its lift is known, both before the first paint, so it never slides into place.)
  const open =
    !collapsed &&
    anchorTop !== null && lift?.id === expanded && placed.some((it) => it.id === expanded)
      ? Math.max(0, anchorTop - lift.px)
      : null
  const cardHeight = useHeight(cardRef, open === null ? null : expanded)
  useWheelInside(cardRef, open === null ? null : expanded)
  const slots = Object.fromEntries(placed.map((it, i) => [it.id, tops[i]]))
  const motion = useCardMotion(colRef, cardRef, { expanded, open, slots, leaving })
  const hidden = new Set([
    ...motion.returning,
    ...(open === null ? [] : [expanded!, ...coveredCards(tops, open, open + cardHeight).map((i) => placed[i].id)]),
  ])
  const { lanes, count } = markerLanes(placed.map((it) => spans[it.id]))
  const laneWidth = Math.min(6, (STRIP - 4) / Math.max(1, count))
  const extent =
    Math.max(
      0,
      ...(collapsed ? placed.map((it) => spans[it.id].bottom) : tops.map((t) => t + CARD_HEIGHT)),
      open === null ? 0 : open + cardHeight,
    ) + 32

  return (
    <div
      ref={colRef}
      data-side-column
      className={clsx('relative shrink-0', slide && 'transition-[width] duration-200 ease-out motion-reduce:transition-none')}
      style={{ width, height: extent }}
    >
      {placed.map((it, i) => {
        const span = spans[it.id]
        const lit = hover.includes(it.id) || it.id === expanded
        return (
          <Tip key={it.id} content={it.tip}>
            <button
              data-item={it.id}
              aria-label={it.tip}
              onClick={() => onToggle(it.id)}
              onMouseEnter={() => onHover([it.id])}
              onMouseLeave={() => onHover([])}
              className={clsx(
                'group/bar absolute flex justify-center rounded-sm transition-[top,height,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                leaving[it.id] && 'pointer-events-none opacity-0',
              )}
              style={nodeStyle(colorOf(it.nodeId), { top: span.top, height: span.bottom - span.top, left: 2 + lanes[i] * laneWidth, width: laneWidth })}
            >
              <span className={clsx('node-bar h-full w-[3px] rounded-full transition-colors', lit && 'lit')} />
            </button>
          </Tip>
        )
      })}

      {/* (Fades in as the column opens; positioned against the column.) */}
      {!collapsed && (
        <div className="anim-fade">
          {placed.map((it, i) => {
            const covered = hidden.has(it.id)
            const lit = hover.includes(it.id)
            return (
              <div
                key={it.id}
                data-card={it.id}
                aria-hidden={covered || undefined}
                onMouseEnter={() => onHover([it.id])}
                onMouseLeave={() => onHover([])}
                className={clsx(
                  'group/card absolute right-1.5 flex items-center rounded-lg border bg-surface text-[13px] shadow-xs',
                  // (The expanded one's goes at once: the card opens out of its place.)
                  it.id === expanded ? 'transition-none' : 'transition-[top,opacity,border-color,background-color] duration-200',
                  lit ? 'border-border-strong' : 'border-border hover:border-border-strong',
                  (covered || leaving[it.id]) && 'pointer-events-none opacity-0',
                )}
                style={nodeStyle(colorOf(it.nodeId), { top: tops[i], left: STRIP, height: CARD_HEIGHT })}
              >
                <button
                  tabIndex={covered ? -1 : undefined}
                  onClick={() => onToggle(it.id)}
                  className="flex h-full min-w-0 flex-1 items-center rounded-lg pr-2 pl-3 text-left focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                >
                  {it.title}
                </button>
                {/* (Shown on hover, like the conversation list's.) */}
                {!covered && renderMenu(it.id, 'opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 mr-1 shrink-0')}
              </div>
            )
          })}
        </div>
      )}

      {open !== null && (
        <Layer
          ref={motion.ref}
          key={expanded}
          data-expanded={expanded}
          className={clsx(
            'absolute right-1.5 z-10 flex flex-col rounded-lg border border-border-strong bg-surface shadow-pop transition-[top,opacity] duration-200',
            leaving[expanded!] && 'pointer-events-none opacity-0',
          )}
          style={nodeStyle(colorOf(placed.find((it) => it.id === expanded)!.nodeId), { top: open, left: STRIP, height: cardLimit })}
          onMouseEnter={() => onHover([expanded!])}
          onMouseLeave={() => onHover([])}
          // Collapses only by Escape (or its buttons), never by clicks or focus elsewhere.
          onEscapeKeyDown={onEscape}
        >
          {renderExpanded(expanded!, cardRef)}
        </Layer>
      )}
    </div>
  )
}

/**
 * An expanded card's header: it looks like the collapsed card (owner, 2026-10-10), which expanding turns into
 * it — with the card's top border, `CARD_HEIGHT` high; the same padding, icon and text.
 */
export const HEADER_CLASS = 'flex h-[35px] shrink-0 cursor-pointer items-center gap-2 border-b border-border pr-1 pl-3 text-[13px]'

/** Where the last press on a header started, if it may collapse its card (one card is expanded at a time). */
let headerPress: { x: number; y: number } | null = null

/**
 * Props for an expanded card's header: a click collapses the card, except on its buttons and inputs (a
 * note's title box). The press must start there too and not drag: a text selection dragged out of the
 * title box (or across the title) ends with a click on the header itself. (React events bubble out of
 * portals too: a click in the header's menu must not count, hence the DOM `contains`.)
 */
export function collapseOnClick(onCollapse: () => void) {
  const onHeader = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as Element
    return e.currentTarget.contains(target) && !target.closest('button, input')
  }
  return {
    onMouseDown: (e: MouseEvent<HTMLElement>) => {
      headerPress = onHeader(e) ? { x: e.clientX, y: e.clientY } : null
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const press = headerPress
      headerPress = null
      if (press && onHeader(e) && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) onCollapse()
    },
  }
}

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
/** The card's header only (its height = a collapsed card's), with room for the shadow at the sides. */
const HEADER = `inset(-24px -24px calc(100% - ${CARD_HEIGHT}px) -24px)`
const WHOLE = 'inset(-24px)'
const REDUCE = '(prefers-reduced-motion: reduce)'

/**
 * Runs an animation by frames, at most ~one frame's time (17 ms) per frame: one of the first frames after the
 * card mounts or unmounts is long (~85 ms, its content settling), and a clock-driven animation lost its whole
 * first step there. A slow frame now delays it slightly instead.
 */
function animate(el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions & { duration: number }) {
  const anim = el.animate(frames, options)
  anim.pause()
  let t = 0
  let last: number | null = null
  let raf = 0
  const tick = (now: number) => {
    if (last !== null) t += Math.min(now - last, 17)
    last = now
    if (t >= options.duration) return void anim.finish()
    anim.currentTime = t
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return { anim, stop: () => (cancelAnimationFrame(raf), anim.cancel()) }
}

/**
 * Expanding and collapsing (owner, 2026-10-10): the collapsed card and the expanded card's header look the
 * same, so expanding reads as the collapsed card gliding to where the expanded card's top will be (when that
 * isn't its place) and the card unfolding below it, ~0.25 s; collapsing plays it backwards a little faster,
 * on a lifeless picture of the card (`snapshot`, taken as it goes), while its collapsed card waits hidden
 * (`returning`) and takes the picture's place in the frame it lands. Transform and clip only: layout,
 * measurements and the scroll rules don't see it. Reduced motion: a fade in, nothing on collapsing.
 */
function useCardMotion(
  col: RefObject<HTMLElement | null>,
  card: RefObject<HTMLDivElement | null>,
  now: { expanded: string | null; open: number | null; slots: Record<string, number>; leaving: Record<string, true> },
) {
  const latest = useRef(now)
  latest.current = now
  const [returning, setReturning] = useState<string[]>([])
  const pictures = useRef(new Map<string, HTMLElement>())
  const drop = useCallback((id: string) => {
    pictures.current.get(id)?.remove()
    pictures.current.delete(id)
    setReturning((r) => (r.includes(id) ? r.filter((x) => x !== id) : r))
  }, [])

  // The card's element. Called with null while it's still in the page (React detaches refs before it removes
  // elements): the moment to take its picture.
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      const old = card.current
      card.current = el
      if (el || !old) return
      const id = old.dataset.expanded
      const { expanded, slots, leaving } = latest.current
      // (Still expanded: StrictMode's pretend detach, or the column closing. Gone or fading out: nowhere to go.)
      if (!id || id === expanded || leaving[id] || slots[id] === undefined || !col.current || matchMedia(REDUCE).matches) return
      drop(id)
      const dy = slots[id] - old.offsetTop
      const { copy, scrolled } = snapshot(old)
      copy.inert = true
      copy.setAttribute('aria-hidden', 'true')
      // Under an expanded card, over the collapsed ones.
      Object.assign(copy.style, { zIndex: '9', pointerEvents: 'none', transition: 'none' })
      col.current.append(copy)
      scrolled()
      pictures.current.set(id, copy)
      setReturning((r) => [...r, id])
      const still = Math.abs(dy) < 1
      const frames = still
        ? [{ clipPath: WHOLE }, { clipPath: HEADER }]
        : [{ clipPath: WHOLE }, { clipPath: HEADER, transform: 'none', offset: 0.55 }, { clipPath: HEADER, transform: `translateY(${dy}px)` }]
      const { anim } = animate(copy, frames.map((f) => ({ ...f, easing: EASE })), { duration: still ? 170 : 210, fill: 'forwards' })
      anim.onfinish = () => {
        if (pictures.current.get(id) !== copy) return
        // Swap at once: the picture still has the expanded card's look (⋯ shown, its shadow, a cut-off bottom),
        // so its collapsed card shows without its fade, in the same frame the picture goes.
        const real = col.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)
        if (real) real.style.transition = 'none'
        flushSync(() => drop(id))
        if (real) {
          void real.offsetHeight
          real.style.transition = ''
        }
      }
    },
    [card, col, drop],
  )

  const opening = now.open === null ? null : now.expanded
  useLayoutEffect(() => {
    const el = card.current
    if (!opening || !el) return
    drop(opening)
    if (matchMedia(REDUCE).matches) return animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 }).stop
    const { slots, open } = latest.current
    const dy = slots[opening] === undefined || open === null ? 0 : slots[opening] - open
    const still = Math.abs(dy) < 1
    const frames = still
      ? [{ clipPath: HEADER }, { clipPath: WHOLE }]
      : [{ clipPath: HEADER, transform: `translateY(${dy}px)` }, { clipPath: HEADER, transform: 'none', offset: 0.4 }, { clipPath: WHOLE }]
    return animate(el, frames.map((f) => ({ ...f, easing: EASE })), { duration: still ? 200 : 250 }).stop
  }, [opening, card, drop])

  return { ref, returning }
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

/**
 * The wheel over an expanded card never scrolls the chat behind it (owner, 2026-10-09): it scrolls what's under
 * the mouse inside the card, and at that box's end (or over the header) nothing. The chat's own listeners (its
 * scroll rules, the reading line) don't see it either. Ctrl + wheel (zoom) is left alone.
 */
function useWheelInside(ref: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const card = ref.current
    if (!card) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      e.stopPropagation()
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
      for (let el = e.target as HTMLElement | null; el && el !== card; el = el.parentElement) {
        if (canScroll(el, dx, dy)) return
      }
      e.preventDefault()
    }
    card.addEventListener('wheel', onWheel, { passive: false })
    return () => card.removeEventListener('wheel', onWheel)
  }, [ref, key])
}

function canScroll(el: HTMLElement, dx: number, dy: number) {
  const s = getComputedStyle(el)
  const can = (overflow: string, pos: number, max: number, d: number) =>
    /auto|scroll/.test(overflow) && max > 1 && ((d < 0 && pos > 0) || (d > 0 && pos < max - 1))
  return (
    can(s.overflowY, el.scrollTop, el.scrollHeight - el.clientHeight, dy) ||
    can(s.overflowX, el.scrollLeft, el.scrollWidth - el.clientWidth, dx)
  )
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

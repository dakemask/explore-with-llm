import clsx from 'clsx'
import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefObject,
} from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { branchColors, colorVar } from '../../lib/colors'
import { plainLine } from '../../lib/anchor'
import { carryKeys, currentUnit, layoutTree, routeTo, type MapUnit, type TreeLayout } from '../../lib/treeMap'
import { childrenOf } from '../../lib/tree'
import { useSettings, type TreeWindow } from '../../store/settings'
import { useUi } from '../../store/ui'
import { HelpTip, IconButton } from '../ui/Button'
import { editLabel } from './labels'

const GX = 34
const GY = 22
const PAD = 30

/** Window limits: smallest size, gap kept to the viewport's edges, and the header it stays below. */
const MIN_W = 220
const MIN_H = 140
const EDGE = 8
const HEADER = 56
const DEFAULT_SIZE = { w: 440, h: 300 }

/** The window's box kept inside the viewport (shrunk first if the viewport is smaller than it). */
function fit(box: TreeWindow): TreeWindow {
  const w = Math.max(MIN_W, Math.min(box.w, innerWidth - EDGE * 2))
  const h = Math.max(MIN_H, Math.min(box.h, innerHeight - HEADER - EDGE * 2))
  const x = Math.max(EDGE, Math.min(box.x, innerWidth - w - EDGE))
  const y = Math.max(HEADER + EDGE, Math.min(box.y, innerHeight - h - EDGE))
  return { x, y, w, h }
}

/**
 * The tree map as a floating window over the chat: moved by its title bar, resized from its bottom-right
 * corner, kept inside the viewport (below the chat header); place and size are remembered (first: top
 * right). It stays open while the user reads, jumps, scrolls or switches conversation — no outside-click
 * closing, so it isn't a `Layer`: it closes by its ✕ / the header button, or Escape while focus is inside
 * it (unless something above took that Escape: a pinned help tip, a dialog). Closing from inside hands
 * focus back to the header button (`opener`). `nodes` undefined = still loading (blank body).
 */
export function TreeMapPanel({
  closing,
  opener,
  onClose,
  nodes,
  mapKey,
  ...map
}: {
  nodes: ChatNode[] | undefined
  /** The conversation: the map restarts (centered on "current") when it changes. */
  mapKey: string
  currentNodeId: string | undefined
  /** The node the chat's path ends at (its attempts are drawn if it is one). */
  endNodeId: string | undefined
  closing: boolean
  opener: RefObject<HTMLElement | null>
  onClose: () => void
  onJump: (unit: MapUnit) => void
}) {
  const t = useT()
  const saved = useSettings((s) => s.treeWindow)
  const save = useSettings((s) => s.setTreeWindow)
  const ref = useRef<HTMLDivElement>(null)
  // While dragging, the box lives here (saved on release); otherwise the saved one.
  const [moving, setMoving] = useState<TreeWindow | null>(null)
  const [, setViewport] = useState(0)
  useEffect(() => {
    const onResize = () => setViewport((n) => n + 1)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])
  const box = fit(moving ?? saved ?? { ...DEFAULT_SIZE, x: innerWidth - DEFAULT_SIZE.w - 16, y: HEADER + 12 })

  /** Pointer drag on the title bar (`move`) or the corner (`resize`), with pointer capture. */
  const drag = (kind: 'move' | 'resize') => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (kind === 'move' && (e.target as Element).closest('button'))) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = { px: e.clientX, py: e.clientY, ...box }
    let last = box
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px
      const dy = ev.clientY - start.py
      last = fit(
        kind === 'move'
          ? { ...start, x: start.x + dx, y: start.y + dy }
          : // Resizing never moves the window: the size is capped by the room to the viewport's edges.
            { ...start, w: Math.min(start.w + dx, innerWidth - start.x - EDGE), h: Math.min(start.h + dy, innerHeight - start.y - EDGE) },
      )
      setMoving(last)
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      save(last)
      setMoving(null)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  const close = () => {
    if (ref.current?.contains(document.activeElement)) opener.current?.focus({ preventScroll: true })
    onClose()
  }

  return (
    <div
      ref={ref}
      data-tree-map
      role="region"
      aria-label={t('tree.title')}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return
        e.preventDefault()
        close()
      }}
      className={clsx(
        'fixed z-20 flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-pop',
        closing ? 'anim-menu-out pointer-events-none' : 'anim-menu',
        moving && 'select-none',
      )}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div
        data-tree-title
        onPointerDown={drag('move')}
        className="flex h-9 shrink-0 cursor-grab items-center gap-1 border-b border-border pr-1.5 pl-3 active:cursor-grabbing"
      >
        <span className="flex-1 truncate text-xs font-medium text-muted select-none">{t('tree.title')}</span>
        <HelpTip
          content={
            <>
              <div>{t('tree.help.click')}</div>
              <div>{t('tree.help.hover')}</div>
              <div>{t('tree.help.right')}</div>
              <div>{t('tree.help.wheel')}</div>
              <div>{t('tree.help.move')}</div>
            </>
          }
        />
        <IconButton label={t('common.close')} size="sm" onClick={close}>
          <X size={15} />
        </IconButton>
      </div>
      {nodes === undefined ? (
        <div className="flex-1" />
      ) : childrenOf(nodes, null).length > 0 ? (
        <TreeMap key={mapKey} nodes={nodes} {...map} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-faint">{t('tree.empty')}</div>
      )}
      <div
        aria-label={t('tree.resize')}
        onPointerDown={drag('resize')}
        className="absolute right-0 bottom-0 size-4 cursor-nwse-resize text-faint"
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path d="M13 7L7 13M13 10.5L10.5 13" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

/**
 * The tree map window's content: a tidy horizontal tree of the main line in branch colors, laid out from
 * the live data (the layout depends on the tree's shape and, for attempts, on where the chat's path ends:
 * `endNodeId` — they're drawn only while it is one of them); hovering a unit grows a bold path to it from
 * the root. `currentNodeId` = the turn the user is looking at (marked "current"; the map scrolls only to
 * bring it back into view when it changes); `onJump` gets the clicked unit. Right-clicking a node edits its label. A mouse wheel scrolls sideways
 * (Shift: up / down); touchpads scroll natively. Remount it per conversation (it opens centered on "current").
 */
export function TreeMap({
  nodes,
  currentNodeId,
  endNodeId,
  onJump,
}: {
  nodes: ChatNode[]
  currentNodeId: string | undefined
  endNodeId: string | undefined
  onJump: (unit: MapUnit) => void
}) {
  const t = useT()
  const uid = 'tm' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const layout = useMemo(() => layoutTree(nodes, endNodeId), [nodes, endNodeId])
  const colors = useMemo(() => branchColors(nodes), [nodes])
  const current = useMemo(() => currentUnit(layout, nodes, currentNodeId), [layout, nodes, currentNodeId])
  const W = PAD * 2 + layout.maxCol * GX + 30
  const H = PAD * 2 + layout.maxRow * GY + 16
  const X = (u: MapUnit) => PAD + u.col * GX
  const Y = (u: MapUnit) => PAD + 16 + u.row * GY

  // ---- changes animate: each drawn unit keeps its element across relayouts (`carryKeys`); places glide
  // and colors fade (CSS transitions), new units grow from their parent, removed ones fade out as ghosts ----
  const keyMemo = useRef(new Map<string, string>())
  const keys = useMemo(() => {
    const k = carryKeys(keyMemo.current, layout)
    keyMemo.current = k.byNode
    return k.byUnit
  }, [layout])
  const keyOf = (u: MapUnit) => keys.get(u.id)!
  // Gradient ids by key (keys hold characters an id reference can't).
  const gradIds = useRef(new Map<string, string>())
  const gradId = (key: string) => {
    let id = gradIds.current.get(key)
    if (!id) gradIds.current.set(key, (id = `${uid}-g-${gradIds.current.size}`))
    return id
  }

  // Every line runs from the parent's color into the unit's (one color where they're the same), so a color
  // change fades along it; always a cubic curve, so a moved line's shape can glide.
  const edges = useMemo(() => {
    const list: { id: string; key: string; d: string; x1: number; x2: number; from: string; to: string }[] = []
    for (const u of layout.units) {
      const parent = u.parent ? layout.byId.get(u.parent) : undefined
      if (!parent) continue
      const x1 = X(parent)
      const y1 = Y(parent)
      const x2 = X(u)
      const y2 = Y(u)
      const d = `M${x1} ${y1} C${x1 + GX * 0.6} ${y1} ${x2 - GX * 0.6} ${y2} ${x2} ${y2}`
      const from = colorVar(colors.get(parent.nodes[0].id) ?? 0)
      list.push({ id: u.id, key: keys.get(u.id)!, d, x1, x2, from, to: colorVar(colors.get(u.nodes[0].id) ?? 0) })
    }
    return list
  }, [layout, colors, keys])
  const stroke = (key: string) => `url(#${gradId(key)})`
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges])
  const labels = useMemo(() => new Map(nodes.flatMap((n) => (n.label ? [[n.id, n.label]] : []))), [nodes])

  // ---- hover: the root→unit path grows in bold from the root; the shared prefix isn't redrawn ----
  const svgRef = useRef<SVGSVGElement>(null)
  const maskRef = useRef<SVGPathElement>(null)
  const lengths = useRef(new Map<string, number>())
  const shown = useRef<string[]>([])
  const anim = useRef<Animation | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [lit, setLit] = useState<{ route: string[]; delays: number[] } | null>(null)
  // The tip's unit is state; its position follows the pointer directly (no re-render per move).
  const [tipId, setTipId] = useState<string | null>(null)
  const tip = (tipId && layout.byId.get(tipId)) || null
  const tipRef = useRef<HTMLDivElement>(null)
  const tipAt = useRef({ x: 0, y: 0 })
  const placeTip = () => {
    const el = tipRef.current
    if (!el) return
    const { x, y } = tipAt.current
    el.style.left = Math.min(x + 14, innerWidth - el.offsetWidth - 8) + 'px'
    el.style.top = Math.min(y + 14, innerHeight - el.offsetHeight - 8) + 'px'
  }
  useLayoutEffect(placeTip, [tipId])

  useLayoutEffect(() => {
    for (const el of svgRef.current?.querySelectorAll<SVGPathElement>('path[data-edge]') ?? []) {
      lengths.current.set(el.dataset.edge!, el.getTotalLength())
    }
  }, [edges])
  useEffect(() => () => clearTimeout(clearTimer.current), [])

  const highlight = (id: string) => {
    clearTimeout(clearTimer.current)
    const route = routeTo(layout, id)
    let k = 0
    while (k < route.length && k < shown.current.length && route[k] === shown.current[k]) k++
    const segs = route.slice(1)
    const cum = [0]
    for (const s of segs) cum.push(cum[cum.length - 1] + (lengths.current.get(s) ?? GX))
    const total = cum[cum.length - 1]
    const pre = cum[Math.max(0, k - 1)]
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const dur = reduce ? 0 : Math.min(300, (total - pre) / 3.5)
    const mask = maskRef.current
    if (mask) {
      mask.setAttribute('d', segs.map((s) => edgeById.get(s)!.d).join(' ') || 'M0 0')
      mask.style.strokeDasharray = `${total + 1} ${total + 60}`
      anim.current?.cancel()
      anim.current = mask.animate([{ strokeDashoffset: total - pre }, { strokeDashoffset: 0 }], {
        duration: dur,
        easing: 'linear',
        fill: 'forwards',
      })
    }
    // Dots swell as the line reaches them.
    const delays = route.map((_, i) => (total > pre && cum[i] > pre ? ((cum[i] - pre) / (total - pre)) * dur : 0))
    shown.current = route
    setLit({ route, delays })
  }
  const unhighlight = () => {
    setTipId(null)
    clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => {
      anim.current?.cancel()
      shown.current = []
      setLit(null)
    }, 120)
  }

  // Opening: the current unit centered where possible. Later, when "current" moves out of view, the map
  // scrolls just enough to bring it back (it never follows otherwise: the user may be looking elsewhere).
  const scrollRef = useRef<HTMLDivElement>(null)
  const opened = useRef(false)
  // The tree sits centered in the map's area; the svg fills it, so a grown tree's new center glides too.
  const [area, setArea] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const read = () => setArea({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const SW = Math.max(W, area.w)
  const SH = Math.max(H, area.h)
  const offset = { x: (SW - W) / 2, y: (SH - H) / 2 }
  // The centering offset glides only right after the tree changed shape (not while the window is resized).
  const shape = layout.units.map((u) => `${keyOf(u)}@${u.col},${u.row}`).join(' ')
  const [shapeShown, setShapeShown] = useState(shape)
  const [glide, setGlide] = useState(false)
  if (shapeShown !== shape) {
    setShapeShown(shape)
    setGlide(true)
  }
  useEffect(() => {
    if (!glide) return
    const timer = setTimeout(() => setGlide(false), 350)
    return () => clearTimeout(timer)
  }, [glide, shape])
  useLayoutEffect(() => {
    const el = scrollRef.current
    const u = current ? layout.byId.get(current) : undefined
    if (!el || !u) return
    const svg = svgRef.current!.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    // The unit's place in the scrolled content.
    const ux = svg.left - box.left + el.scrollLeft + offset.x + X(u)
    const uy = svg.top - box.top + el.scrollTop + offset.y + Y(u)
    if (!opened.current) {
      opened.current = true
      el.scrollLeft = ux - el.clientWidth / 2
      el.scrollTop = uy - el.clientHeight / 2
      return
    }
    const M = 40
    const into = (pos: number, start: number, size: number) =>
      pos < start + M ? pos - M : pos > start + size - M ? pos - size + M : start
    const left = into(ux, el.scrollLeft, el.clientWidth)
    const top = into(uy, el.scrollTop, el.clientHeight)
    if (left !== el.scrollLeft || top !== el.scrollTop) el.scrollTo({ left, top, behavior: 'smooth' })
  }, [current])

  // A mouse wheel scrolls sideways (the tree grows to the right), Shift + wheel up / down. Only whole
  // notches count as a mouse wheel; touchpads (fine deltas, both axes) keep native scrolling. A listener
  // of our own: React's wheel handlers are passive and can't stop the native scroll.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let target: { left: number; top: number } | null = null
    const onEnd = () => (target = null)
    const onWheel = (e: WheelEvent) => {
      const legacy = e as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number }
      const notch = (v: number | undefined) => !!v && v % 120 === 0
      const delta = (e.shiftKey ? e.deltaX || e.deltaY : e.deltaY) * (e.deltaMode === 1 ? 16 : 1)
      const mouse = e.shiftKey ? notch(legacy.wheelDeltaX) || notch(legacy.wheelDeltaY) : e.deltaX === 0 && notch(legacy.wheelDeltaY)
      if (!mouse || e.ctrlKey || !delta) return
      const horizontal = !e.shiftKey
      // Nothing to scroll that way: leave the wheel to its native direction.
      if (horizontal ? el.scrollWidth <= el.clientWidth : el.scrollHeight <= el.clientHeight) return
      e.preventDefault()
      // Successive notches add up to one smooth glide (each smooth scroll would restart from where it is).
      target ??= { left: el.scrollLeft, top: el.scrollTop }
      if (horizontal) target.left = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, target.left + delta))
      else target.top = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target.top + delta))
      el.scrollTo({ ...target, behavior: 'smooth' })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scrollend', onEnd)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scrollend', onEnd)
    }
  }, [])

  const onKey = (e: KeyboardEvent, u: MapUnit) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onJump(u)
    }
  }
  const showTip = (x: number, y: number, u: MapUnit) => {
    tipAt.current = { x, y }
    if (tipId === u.id) placeTip()
    else setTipId(u.id)
  }
  const label = (u: MapUnit) => {
    const n = u.nodes[0]
    if (u.type === 'stack') return t('tree.stack', { n: u.col + 1, m: u.nodes.length })
    const own = labels.get(n.id)
    return `${own ? own + ' · ' : ''}${t('tree.turn', { n: u.col + 1 })} ${plainLine(n.user.text) || t('image.only')}`
  }
  // (A hovered route can outlive its units for a render when the tree changes underneath.)
  const litRoute = lit?.route.filter((id) => layout.byId.has(id)) ?? []
  const litIds = lit ? new Map(lit.route.map((id, i) => [id, lit.delays[i]])) : undefined
  const fresh = useUi((s) => s.newBranches)

  // What was drawn last time, by key: new keys grow in from their parent, gone ones become ghosts.
  type Drawn = { x: number; y: number; color: string; d?: string }
  const drawn = useRef<Map<string, Drawn> | null>(null)
  const [ghosts, setGhosts] = useState<(Drawn & { key: string })[]>([])
  useLayoutEffect(() => {
    const now = new Map<string, Drawn>()
    for (const u of layout.units) {
      now.set(keyOf(u), {
        x: X(u),
        y: Y(u),
        color: colorVar(colors.get(u.nodes[0].id) ?? 0),
        d: edges.find((e) => e.id === u.id)?.d,
      })
    }
    const before = drawn.current
    drawn.current = now
    if (!before || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const svg = svgRef.current!
    const ease = { duration: 300, easing: 'ease-out' }
    for (const u of layout.units) {
      const key = keyOf(u)
      if (before.has(key)) continue
      const parent = u.parent ? layout.byId.get(u.parent) : undefined
      const [px, py] = parent ? [X(parent), Y(parent)] : [X(u), Y(u)]
      svg.querySelector(`[data-key="${CSS.escape(key)}"]`)?.animate(
        [
          { transform: `translate(${px}px, ${py}px) scale(0.3)`, opacity: 0 },
          { transform: `translate(${X(u)}px, ${Y(u)}px) scale(1)`, opacity: 1 },
        ],
        ease,
      )
      svg.querySelector(`[data-edge-key="${CSS.escape(key)}"]`)?.animate(
        [
          { strokeDasharray: '1 1', strokeDashoffset: 1 },
          { strokeDasharray: '1 1', strokeDashoffset: 0 },
        ],
        ease,
      )
    }
    const gone = [...before].filter(([key]) => !now.has(key)).map(([key, g]) => ({ key, ...g }))
    if (gone.length) setGhosts((list) => [...list.filter((g) => !now.has(g.key)), ...gone])
  }, [layout, colors, edges])
  useEffect(() => {
    if (!ghosts.length) return
    const timer = setTimeout(() => setGhosts([]), 300)
    return () => clearTimeout(timer)
  }, [ghosts])

  const currentLabel = t('tree.current')
  const pillW = Math.max(34, currentLabel.length * 6.5 + 16)
  const currentAt = (() => {
    const u = current ? layout.byId.get(current) : undefined
    return u && { x: X(u), y: Y(u) }
  })()
  const pill = useMemo(() => {
    const u = current ? layout.byId.get(current) : undefined
    return u && pillSpot(layout, u, X, Y, pillW, W, H)
  }, [layout, current, pillW])

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 overflow-auto">
      <svg
        ref={svgRef}
        width={SW}
        height={SH}
        viewBox={`0 0 ${SW} ${SH}`}
        role="group"
        aria-label={t('tree.label')}
        className="tree-map-svg block shrink-0 font-sans"
      >
        <defs>
          {edges.map((e) => (
            <linearGradient key={e.key} id={gradId(e.key)} gradientUnits="userSpaceOnUse" x1={e.x1} y1={0} x2={e.x2} y2={0}>
              <stop offset={0.1} style={{ stopColor: e.from }} />
              <stop offset={0.9} style={{ stopColor: e.to }} />
            </linearGradient>
          ))}
          <mask id={`${uid}-reveal`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <path ref={maskRef} fill="none" stroke="#fff" strokeWidth={30} strokeLinecap="round" />
          </mask>
        </defs>
        <g className={clsx(glide && 'tree-glide')} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
          {ghosts.map((g) => (
            <g key={g.key} className="tree-ghost">
              {g.d && <path d={g.d} fill="none" style={{ stroke: g.color }} strokeWidth={2} strokeLinecap="round" />}
              <circle cx={g.x} cy={g.y} r={5} style={{ fill: g.color }} />
            </g>
          ))}
          <g>
            {edges.map((e) => (
              <path
                key={e.key}
                data-edge={e.id}
                data-edge-key={e.key}
                className="tree-edge"
                d={e.d}
                pathLength={1}
                fill="none"
                style={{ stroke: stroke(e.key), d: `path("${e.d}")` } as CSSProperties}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}
          </g>
          <g mask={`url(#${uid}-reveal)`}>
            {litRoute.slice(1).map((id) => {
              const e = edgeById.get(id)
              if (!e) return null
              return <path key={id} d={e.d} fill="none" style={{ stroke: stroke(e.key) }} strokeWidth={4.5} strokeLinecap="round" />
            })}
          </g>
          <g>
            {layout.units.map((u) => {
              const c = colorVar(colors.get(u.nodes[0].id) ?? 0)
              const here = u.id === current
              const delay = litIds?.get(u.id)
              return (
                <g
                  key={keyOf(u)}
                  data-key={keyOf(u)}
                  className={clsx('tree-node', delay !== undefined && 'lit')}
                  style={{ '--delay': `${delay ?? 0}ms`, transform: `translate(${X(u)}px, ${Y(u)}px)` } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  aria-label={label(u)}
                  aria-current={here || undefined}
                  onClick={() => onJump(u)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    if (u.type === 'node') void editLabel({ id: u.nodes[0].id, label: labels.get(u.nodes[0].id) }, t)
                  }}
                  onKeyDown={(e) => onKey(e, u)}
                  onMouseEnter={() => highlight(u.id)}
                  onMouseMove={(e) => showTip(e.clientX, e.clientY, u)}
                  onMouseLeave={unhighlight}
                  onFocus={(e) => {
                    highlight(u.id)
                    const r = e.currentTarget.getBoundingClientRect()
                    showTip(r.right, r.bottom, u)
                  }}
                  onBlur={unhighlight}
                >
                  <circle className="halo" r={11} />
                  {/* Just became a branch: the switcher's double ripple, in its color. */}
                  {u.type === 'node' && fresh[u.nodes[0].id] && (
                    <circle className="tree-ripple anim-branch-ring" r={5} style={{ fill: c }} />
                  )}
                  <circle className="core" r={5} style={{ fill: c }} />
                  {u.type === 'stack' && (
                    <text x={10} y={4} fontSize={10.5} style={{ fill: 'var(--c-muted)' }}>
                      ×{u.nodes.length}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
          {/* "Current": ring + label, gliding to the turn it moves to. */}
          {currentAt && (
            <g className="tree-moves" style={{ transform: `translate(${currentAt.x}px, ${currentAt.y}px)` }} pointerEvents="none">
              <circle r={9.5} fill="none" style={{ stroke: 'var(--c-text)' }} strokeWidth={2} />
            </g>
          )}
          {pill && (
            <g className="tree-moves" style={{ transform: `translate(${pill.x}px, ${pill.y}px)` }} pointerEvents="none">
              <rect x={-pillW / 2} y={-8.5} width={pillW} height={17} rx={8.5} style={{ fill: 'var(--c-text)' }} />
              <text y={4} textAnchor="middle" fontSize={10.5} fontWeight={600} style={{ fill: 'var(--c-surface)' }}>
                {currentLabel}
              </text>
            </g>
          )}
        </g>
      </svg>
      {tip && <TreeTip ref={tipRef} unit={tip} labels={labels} />}
    </div>
  )
}

/**
 * Center of the "current" pill: above the node, unless a neighbor (node, line or ×n) is drawn there; then
 * below, left, right. Above when nothing is free.
 */
function pillSpot(
  layout: TreeLayout,
  u: MapUnit,
  X: (u: MapUnit) => number,
  Y: (u: MapUnit) => number,
  pillW: number,
  W: number,
  H: number,
) {
  const pts: [number, number][] = []
  for (const v of layout.units) {
    if (v !== u) pts.push([X(v), Y(v)])
    if (v.type === 'stack') for (const dx of [12, 20, 28]) pts.push([X(v) + dx, Y(v)])
    const p = v.parent ? layout.byId.get(v.parent) : undefined
    if (!p) continue
    // Samples along the edge (same curve as drawn: horizontal tangents at both ends).
    const [x1, y1, x2, y2] = [X(p), Y(p), X(v), Y(v)]
    for (let i = 1; i < 12; i++) {
      const s = i / 12
      const a = (1 - s) ** 3 + 3 * (1 - s) ** 2 * s
      const x = (1 - s) ** 3 * x1 + 3 * (1 - s) ** 2 * s * (x1 + GX * 0.6) + 3 * (1 - s) * s * s * (x2 - GX * 0.6) + s ** 3 * x2
      pts.push([x, a * y1 + (1 - a) * y2])
    }
  }
  const cx = X(u)
  const cy = Y(u)
  const hw = pillW / 2
  const spots = [
    { x: cx, y: cy - 17.5 },
    { x: cx, y: cy + 17.5 },
    { x: cx - hw - 13, y: cy },
    { x: cx + hw + 13, y: cy },
  ]
  const free = (s: { x: number; y: number }) =>
    s.x - hw >= 0 &&
    s.x + hw <= W &&
    s.y - 8.5 >= 0 &&
    s.y + 8.5 <= H &&
    pts.every(([x, y]) => Math.abs(x - s.x) > hw + 5 || Math.abs(y - s.y) > 8.5 + 5)
  return spots.find(free) ?? spots[0]
}

/**
 * Hover tip: the node's label, the turn, then the first lines of the user message and the reply. Stacks:
 * the turn and count, then the labels of the attempts that have one.
 */
function TreeTip({ unit, labels, ref }: { unit: MapUnit; labels: Map<string, string>; ref: Ref<HTMLDivElement> }) {
  const t = useT()
  const n = unit.nodes[0]
  const reply = plainLine(n.assistant.content)
  const label = labels.get(n.id)
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-50 max-w-80 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs leading-relaxed shadow-pop"
    >
      {unit.type === 'stack' ? (
        <>
          <div className="font-medium">{t('tree.stack', { n: unit.col + 1, m: unit.nodes.length })}</div>
          {unit.nodes.map(
            (a) =>
              labels.has(a.id) && (
                <div key={a.id} className="truncate">
                  · {labels.get(a.id)}
                </div>
              ),
          )}
        </>
      ) : (
        <>
          {label && <div className="truncate font-semibold">{label}</div>}
          <div className={label ? 'text-muted' : 'font-medium'}>{t('tree.turn', { n: unit.col + 1 })}</div>
          <div className="truncate">{plainLine(n.user.text) || t('image.only')}</div>
          {reply && <div className="truncate text-muted">{reply}</div>}
        </>
      )}
    </div>
  )
}

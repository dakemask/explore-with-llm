import clsx from 'clsx'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
  type RefObject,
} from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { branchColors, colorVar } from '../../lib/colors'
import { plainLine } from '../../lib/anchor'
import { currentUnit, layoutTree, routeTo, type MapUnit } from '../../lib/treeMap'

const GX = 34
const GY = 22
const PAD = 30

/**
 * The tree map, dropped down under the chat header over the chat (full column width, at most half the
 * screen high). Closes on Escape and on a click outside it (except on `ignore`, the button toggling it).
 */
export function TreeMapPanel({
  closing,
  ignore,
  onClose,
  ...map
}: {
  nodes: ChatNode[]
  currentNodeId: string | undefined
  closing: boolean
  ignore: RefObject<HTMLElement | null>
  onClose: () => void
  onJump: (unit: MapUnit) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !ignore.current?.contains(target)) close.current()
    }
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close.current()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ignore])
  return (
    <div
      ref={ref}
      className={clsx(
        'absolute inset-x-0 top-14 z-20 border-b border-border bg-surface shadow-pop',
        closing ? 'anim-menu-out pointer-events-none' : 'anim-menu',
      )}
    >
      <TreeMap {...map} />
    </div>
  )
}

/**
 * The tree map panel's content (`docs/tree-preview.html`): a tidy horizontal tree of the main line in
 * branch colors. Laid out once when it opens; hovering a unit grows a bold path to it from the root.
 * `currentNodeId` = the turn the user was looking at (marked "current"); `onJump` gets the clicked unit.
 */
export function TreeMap({
  nodes,
  currentNodeId,
  onJump,
}: {
  nodes: ChatNode[]
  currentNodeId: string | undefined
  onJump: (unit: MapUnit) => void
}) {
  const t = useT()
  const uid = 'tm' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // Fixed while open: no relayout when the conversation changes underneath.
  const [{ layout, colors, current }] = useState(() => {
    const layout = layoutTree(nodes)
    return { layout, colors: branchColors(nodes), current: currentUnit(layout, nodes, currentNodeId) }
  })
  const W = PAD * 2 + layout.maxCol * GX + 30
  const H = PAD * 2 + layout.maxRow * GY + 16
  const X = (u: MapUnit) => PAD + u.col * GX
  const Y = (u: MapUnit) => PAD + 16 + u.row * GY

  const edges = useMemo(() => {
    const list: { id: string; d: string; stroke: string; gradient?: { x1: number; x2: number; from: string; to: string } }[] = []
    for (const u of layout.units) {
      const parent = u.parent ? layout.byId.get(u.parent) : undefined
      if (!parent) continue
      const c = colors.get(u.nodes[0].id) ?? 0
      const pc = colors.get(parent.nodes[0].id) ?? 0
      const x1 = X(parent)
      const y1 = Y(parent)
      const x2 = X(u)
      const y2 = Y(u)
      const d =
        y1 === y2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${x1 + GX * 0.6} ${y1} ${x2 - GX * 0.6} ${y2} ${x2} ${y2}`
      // Where the color changes, the line flows from the parent's color into the unit's.
      if (pc !== c) {
        list.push({ id: u.id, d, stroke: `url(#${uid}-g-${list.length})`, gradient: { x1, x2, from: colorVar(pc), to: colorVar(c) } })
      } else list.push({ id: u.id, d, stroke: colorVar(c) })
    }
    return list
  }, [layout, colors, uid])
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges])

  // ---- hover: the root→unit path grows in bold from the root; the shared prefix isn't redrawn ----
  const svgRef = useRef<SVGSVGElement>(null)
  const maskRef = useRef<SVGPathElement>(null)
  const lengths = useRef(new Map<string, number>())
  const shown = useRef<string[]>([])
  const anim = useRef<Animation | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [lit, setLit] = useState<{ route: string[]; delays: number[] } | null>(null)
  // The tip's unit is state; its position follows the pointer directly (no re-render per move).
  const [tip, setTip] = useState<MapUnit | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tipAt = useRef({ x: 0, y: 0 })
  const placeTip = () => {
    const el = tipRef.current
    if (!el) return
    const { x, y } = tipAt.current
    el.style.left = Math.min(x + 14, innerWidth - el.offsetWidth - 8) + 'px'
    el.style.top = Math.min(y + 14, innerHeight - el.offsetHeight - 8) + 'px'
  }
  useLayoutEffect(placeTip, [tip])

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
    setTip(null)
    clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => {
      anim.current?.cancel()
      shown.current = []
      setLit(null)
    }, 120)
  }

  // Scroll so the current unit is in view, centered where possible.
  const scrollRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    const u = current ? layout.byId.get(current) : undefined
    if (!el || !u) return
    const svg = svgRef.current!
    const left = svg.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
    el.scrollLeft = left + X(u) - el.clientWidth / 2
    el.scrollTop = Y(u) - el.clientHeight / 2
  }, [])

  const onKey = (e: KeyboardEvent, u: MapUnit) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onJump(u)
    }
  }
  const showTip = (x: number, y: number, u: MapUnit) => {
    tipAt.current = { x, y }
    if (tip === u) placeTip()
    else setTip(u)
  }
  const label = (u: MapUnit) => {
    const n = u.nodes[0]
    return u.type === 'stack'
      ? t('tree.stack', { n: u.col + 1, m: u.nodes.length })
      : `${t('tree.turn', { n: u.col + 1 })} ${plainLine(n.user.text) || t('image.only')}`
  }
  const litIds = lit ? new Map(lit.route.map((id, i) => [id, lit.delays[i]])) : undefined
  const currentLabel = t('tree.current')
  const pillW = Math.max(34, currentLabel.length * 6.5 + 16)

  return (
    <div ref={scrollRef} className="flex max-h-[50vh] overflow-auto">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={t('tree.label')}
        className="m-auto block shrink-0 font-sans"
      >
        <defs>
          {edges.map(
            (e, i) =>
              e.gradient && (
                <linearGradient
                  key={e.id}
                  id={`${uid}-g-${i}`}
                  gradientUnits="userSpaceOnUse"
                  x1={e.gradient.x1}
                  y1={0}
                  x2={e.gradient.x2}
                  y2={0}
                >
                  <stop offset={0.1} style={{ stopColor: e.gradient.from }} />
                  <stop offset={0.9} style={{ stopColor: e.gradient.to }} />
                </linearGradient>
              ),
          )}
          <mask id={`${uid}-reveal`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <path ref={maskRef} fill="none" stroke="#fff" strokeWidth={30} strokeLinecap="round" />
          </mask>
        </defs>
        <g>
          {edges.map((e) => (
            <path
              key={e.id}
              data-edge={e.id}
              d={e.d}
              fill="none"
              style={{ stroke: e.stroke }}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </g>
        <g mask={`url(#${uid}-reveal)`}>
          {lit?.route.slice(1).map((id) => {
            const e = edgeById.get(id)!
            return <path key={id} d={e.d} fill="none" style={{ stroke: e.stroke }} strokeWidth={4.5} strokeLinecap="round" />
          })}
        </g>
        <g>
          {layout.units.map((u) => {
            const c = colorVar(colors.get(u.nodes[0].id) ?? 0)
            const here = u.id === current
            const delay = litIds?.get(u.id)
            return (
              <g
                key={u.id}
                className={clsx('tree-node', delay !== undefined && 'lit')}
                style={{ '--delay': `${delay ?? 0}ms` } as CSSProperties}
                transform={`translate(${X(u)} ${Y(u)})`}
                role="button"
                tabIndex={0}
                aria-label={label(u)}
                aria-current={here || undefined}
                onClick={() => onJump(u)}
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
                {u.type === 'stack' ? (
                  <>
                    <circle cx={3.5} cy={-3} r={5.5} style={{ fill: c }} opacity={0.55} />
                    <circle r={5.5} style={{ fill: c, stroke: 'var(--c-surface)' }} strokeWidth={1.5} />
                    <text x={10} y={4} fontSize={10.5} style={{ fill: 'var(--c-muted)' }}>
                      ×{u.nodes.length}
                    </text>
                  </>
                ) : (
                  <circle className="core" r={5} style={{ fill: c }} />
                )}
                {here && (
                  <>
                    <circle r={9.5} fill="none" style={{ stroke: 'var(--c-text)' }} strokeWidth={2} />
                    <g transform="translate(0 -16)">
                      <rect x={-pillW / 2} y={-10} width={pillW} height={17} rx={8.5} style={{ fill: 'var(--c-text)' }} />
                      <text y={3} textAnchor="middle" fontSize={10.5} fontWeight={600} style={{ fill: 'var(--c-surface)' }}>
                        {currentLabel}
                      </text>
                    </g>
                  </>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      {tip && <TreeTip ref={tipRef} unit={tip} />}
    </div>
  )
}

/** Hover tip: the turn, then the first lines of the user message and the reply. */
function TreeTip({ unit, ref }: { unit: MapUnit; ref: Ref<HTMLDivElement> }) {
  const t = useT()
  const n = unit.nodes[0]
  const reply = plainLine(n.assistant.content)
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-50 max-w-80 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs leading-relaxed shadow-pop"
    >
      {unit.type === 'stack' ? (
        <div className="font-medium">{t('tree.stack', { n: unit.col + 1, m: unit.nodes.length })}</div>
      ) : (
        <>
          <div className="font-medium">{t('tree.turn', { n: unit.col + 1 })}</div>
          <div className="truncate">{plainLine(n.user.text) || t('image.only')}</div>
          {reply && <div className="truncate text-muted">{reply}</div>}
        </>
      )}
    </div>
  )
}

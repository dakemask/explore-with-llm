import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { plainLine } from '../../lib/anchor'
import { colorVar, GREY } from '../../lib/colors'
import { branchesOf, forkKey, siblingsOf } from '../../lib/tree'
import { useUi } from '../../store/ui'
import { IconButton, Tip } from '../ui/Button'

/** What the switcher of one node shows. Plain data, so memoized messages only re-render when it changes. */
export interface Siblings {
  current: string
  /** Conversation + fork key: a switch shows another node (with a new switcher) at the same fork. */
  fork: string
  /** Main nodes: the branches at this fork with their colors, oldest first. Side nodes: none. */
  branches: { id: string; color: number; title: string; label?: string }[]
  /** Main nodes: the attempts at this fork; side nodes: every version. Oldest first. */
  attempts: { id: string; title: string; label?: string }[]
  /** Side-thread node: a plain ‹n/m› over all versions. */
  side: boolean
}

/**
 * Sibling info for every node of a path (side nodes without siblings get none). `colors` = branch colors
 * (main path only). Unchanged entries keep their object identity.
 */
export function useSiblings(path: ChatNode[], nodes: ChatNode[] | undefined, colors?: Map<string, number>) {
  const t = useT()
  const cache = useRef(new Map<string, Siblings>())
  return useMemo(() => {
    const next = new Map<string, Siblings>()
    for (const n of path) {
      const sibs = siblingsOf(nodes ?? [], n)
      // Main nodes show a lone version too (its dot tells branch from attempt); side nodes only ‹n/m›.
      if (sibs.length < (n.kind === 'side' ? 2 : 1)) continue
      // Retries share the user text, so the reply's opening tells them apart.
      const title = (s: ChatNode) => {
        const reply = firstLine(s.assistant.content)
        return (firstLine(s.user.text) || t('image.only')) + (reply ? ' → ' + reply : '')
      }
      const side = n.kind === 'side'
      const info: Siblings = {
        current: n.id,
        fork: n.conversationId + ' ' + forkKey(n),
        side,
        branches: side
          ? []
          : branchesOf(sibs).map((s) => ({ id: s.id, color: colors?.get(s.id) ?? GREY, title: title(s), label: s.label })),
        attempts: sibs.filter((s) => side || !s.branch).map((s) => ({ id: s.id, title: title(s), label: s.label })),
      }
      const prev = cache.current.get(n.id)
      next.set(n.id, prev && JSON.stringify(prev) === JSON.stringify(info) ? prev : info)
    }
    cache.current = next
    return next
  }, [path, nodes, colors, t])
}

const firstLine = (text: string) => plainLine(text, 30)

/**
 * The versions at a node's fork, in its header (top left). Main nodes: one dot per branch in
 * its color, then the attempts as one grey dot (‹n/m› among them while one is shown). Side nodes: ‹n/m›.
 * Switching replaces the node (and this switcher) at the fork; the new one carries on from what the old one
 * showed (owner, 2026-10-08): the ring glides from the old dot to the new, the attempts' arrows open out or
 * fold away.
 */
export function SiblingSwitcher({ info, onSelect }: { info: Siblings; onSelect: (id: string) => void }) {
  const t = useT()
  const { branches, attempts, current } = info
  const at = attempts.findIndex((a) => a.id === current)
  const ref = useRef<HTMLDivElement>(null)
  // What the switcher at this fork showed a moment ago (the previous node's, which unmounts in the same commit
  // before this one's layout effects run), if anything.
  // (Once: React's StrictMode remounts in development, and the remount would find its own state.)
  const [before, setBefore] = useState<Memory | undefined>()
  const { fork } = info
  const recalled = useRef(false)
  useLayoutEffect(() => {
    if (recalled.current) return
    recalled.current = true
    const m = recall(fork)
    if (m) setBefore(m)
  }, [fork])
  const ring = useRing(ref, before?.x)
  const attemptsShown = attempts.length > 1 && at >= 0
  // While a branch is shown, the folding arrows still show the attempt they showed.
  const shownAt = at >= 0 ? at : Math.max(0, Math.min(before?.at ?? 0, attempts.length - 1))
  const latest = useRef({ open: attemptsShown, at: shownAt })
  latest.current = { open: attemptsShown, at: shownAt }
  useLayoutEffect(() => () => remember(fork, { x: ring.current.current, ...latest.current }), [fork, ring.current])
  const arrows = (prev: string, next: string) => (
    <>
      <IconButton label={prev} size="sm" onClick={() => onSelect(attempts[shownAt - 1].id)} disabled={shownAt <= 0}>
        <ChevronLeft size={15} />
      </IconButton>
      <span className="min-w-9 text-center text-xs text-muted tabular-nums select-none">
        {shownAt + 1} / {attempts.length}
      </span>
      <IconButton
        label={next}
        size="sm"
        onClick={() => onSelect(attempts[shownAt + 1].id)}
        disabled={shownAt === attempts.length - 1}
      >
        <ChevronRight size={15} />
      </IconButton>
    </>
  )

  if (info.side) {
    return <div className="flex shrink-0 items-center">{arrows(t('switch.prevVersion'), t('switch.nextVersion'))}</div>
  }

  return (
    <div ref={ref} className="relative flex shrink-0 items-center">
      {branches.map((b) => (
        <Dot key={b.id} id={b.id} color={b.color} title={b.title} label={b.label} current={b.id === current} onClick={() => onSelect(b.id)} />
      ))}
      {branches.length > 0 && attempts.length > 0 && <span className="mx-1.5 h-3.5 w-px bg-border-strong" />}
      {attempts.length === 1 ? (
        // A single attempt beside branches is just one more (grey) dot.
        <Dot
          id={attempts[0].id}
          color={GREY}
          title={attempts[0].title}
          label={attempts[0].label}
          current={at === 0}
          onClick={() => onSelect(attempts[0].id)}
        />
      ) : attemptsShown ? (
        <>
          <span className="flex size-6 items-center justify-center" aria-hidden>
            <Stack current />
          </span>
          {/* Coming from a branch: the ×n folds away and the arrows open out. */}
          <Reveal key={before ? 1 : 0} open={false} from={before && !before.open}>
            <span className="pr-1.5 text-xs text-muted tabular-nums">×{attempts.length}</span>
          </Reveal>
          <Reveal key={before ? 1 : 0} open from={before?.open}>
            {arrows(t('switch.prevAttempt'), t('switch.nextAttempt'))}
          </Reveal>
        </>
      ) : (
        attempts.length > 1 && (
          <>
            <Tip content={t('switch.attempts', { n: attempts.length })}>
              <button
                type="button"
                aria-label={t('switch.attempts', { n: attempts.length })}
                onClick={() => onSelect(attempts[attempts.length - 1].id)}
                className={clsx(
                  'flex h-6 items-center gap-1 rounded-md pr-1.5 pl-1 text-xs text-muted transition-colors',
                  'hover:bg-hover hover:text-text focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                )}
              >
                <span className="flex size-4 items-center justify-center">
                  <Stack />
                </span>
                <Reveal key={before ? 1 : 0} open from={before && !before.open}>
                  <span className="tabular-nums">×{attempts.length}</span>
                </Reveal>
              </button>
            </Tip>
            {/* Coming from an attempt: its arrows fold away. */}
            <Reveal key={before ? 1 : 0} open={false} from={before?.open}>
              {arrows(t('switch.prevAttempt'), t('switch.nextAttempt'))}
            </Reveal>
          </>
        )
      )}
      {ring.x !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[calc(50%-7.5px)] left-0 size-[15px] rounded-full border-[1.5px] border-text motion-reduce:transition-none"
          style={{
            transform: `translateX(${ring.x - 7.5}px)`,
            transition: ring.glide ? `transform ${GLIDE_MS}ms cubic-bezier(0.2, 0, 0, 1)` : undefined,
          }}
        />
      )}
    </div>
  )
}

const GLIDE_MS = 220

/** A switcher's state when it went: the ring's place, whether the attempts' arrows were open, at which attempt. */
interface Memory {
  x: number | null
  open: boolean
  at: number
  time: number
}
/** The last switcher's state per fork, for the one replacing it (unmounted in the same commit). */
const memory = new Map<string, Memory>()
function remember(fork: string, state: Omit<Memory, 'time'>) {
  memory.set(fork, { ...state, time: performance.now() })
}
function recall(fork: string) {
  const m = memory.get(fork)
  memory.delete(fork)
  return m && performance.now() - m.time < 100 ? m : undefined
}

/**
 * The ring around the shown dot (`data-dot-current`): one element that glides from dot to dot. Once `from` is
 * known (where the previous switcher at this fork had it), it starts there. `current` = its latest place.
 */
function useRing(ref: RefObject<HTMLDivElement | null>, from: number | null | undefined) {
  const [ring, setRing] = useState<{ x: number | null; glide: boolean }>({ x: null, glide: false })
  const current = useRef<number | null>(null)
  const started = useRef(false)
  useLayoutEffect(() => {
    if (from != null && !started.current) {
      started.current = true
      if (from !== ring.x) return setRing({ x: from, glide: false })
    }
    const box = ref.current
    const dot = box?.querySelector<HTMLElement>('[data-dot-current]')
    if (!box || !dot) {
      current.current = null
      if (ring.x !== null) setRing({ x: null, glide: false })
      return
    }
    const r = dot.getBoundingClientRect()
    const x = Math.round((r.left + r.width / 2 - box.getBoundingClientRect().left) * 2) / 2
    current.current = x
    if (x === ring.x) return
    if (ring.x === null) return setRing({ x, glide: false })
    // Glide from where it is (computed above), in the next frame.
    const frame = requestAnimationFrame(() => setRing({ x, glide: true }))
    return () => cancelAnimationFrame(frame)
  })
  return { x: ring.x, glide: ring.glide, current }
}

/** Opens out sideways or folds away: `open` = where it goes, `from` = where it starts (default: there already). */
function Reveal({ open, from, children }: { open: boolean; from?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(from ?? open)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (shown === open) return
    ref.current?.getBoundingClientRect() // (the starting state is computed, so it transitions)
    const frame = requestAnimationFrame(() => setShown(open))
    return () => cancelAnimationFrame(frame)
  }, [open, shown])
  // Folded away for good (after its transition): not rendered.
  const [gone, setGone] = useState(!open && !shown)
  if (open && gone) setGone(false)
  if (gone) return null
  return (
    <div
      ref={ref}
      inert={!open}
      onTransitionEnd={(e) => e.target === e.currentTarget && !open && !shown && setGone(true)}
      className={clsx(
        'grid transition-[grid-template-columns,opacity] duration-200 ease-out motion-reduce:transition-none',
        shown ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0',
      )}
    >
      <div className="flex min-w-0 items-center overflow-hidden">{children}</div>
    </div>
  )
}

/**
 * One branch (or a lone attempt): a dot in its color; the shown one is ringed (by the switcher's ring). Tip: its
 * label, then `title`. A node that just became a branch pops in with a ripple in its color (`useUi().newBranches`).
 */
function Dot({
  id,
  color,
  title,
  label,
  current,
  onClick,
}: {
  id: string
  color: number
  title: string
  label?: string
  current: boolean
  onClick: () => void
}) {
  const fresh = useUi((s) => !!s.newBranches[id])
  return (
    <Tip
      content={
        label ? (
          <>
            <div className="font-semibold">{label}</div>
            <div className="opacity-75">{title}</div>
          </>
        ) : (
          title
        )
      }
    >
      <button
        type="button"
        aria-label={label ? `${label} · ${title}` : title}
        aria-current={current || undefined}
        data-dot-current={current || undefined}
        onClick={onClick}
        className={clsx(
          'flex size-6 items-center justify-center rounded-full transition-colors hover:bg-hover',
          'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
        )}
      >
        <span className={clsx('relative size-2 rounded-full', fresh && 'anim-branch-in')} style={{ background: colorVar(color) }}>
          {fresh && <span aria-hidden className="anim-branch-ring absolute inset-0 rounded-full" style={{ background: colorVar(color) }} />}
        </span>
      </button>
    </Tip>
  )
}

/** Several attempts: one grey dot (like a lone attempt's; the count beside it tells them apart), ringed when one of them is shown. */
function Stack({ current }: { current?: boolean }) {
  return <span data-dot-current={current || undefined} className="size-2 rounded-full" style={{ background: colorVar(GREY) }} />
}

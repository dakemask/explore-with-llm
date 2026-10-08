import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useRef } from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { plainLine } from '../../lib/anchor'
import { colorVar, GREY } from '../../lib/colors'
import { siblingsOf } from '../../lib/tree'
import { useUi } from '../../store/ui'
import { IconButton, Tip } from '../ui/Button'

/** What the switcher of one node shows. Plain data, so memoized messages only re-render when it changes. */
export interface Siblings {
  current: string
  /** Main nodes: the branches at this fork with their colors, oldest first. Side nodes: none. */
  branches: { id: string; color: number; title: string; label?: string }[]
  /** Main nodes: the attempts at this fork; side nodes: every version. Oldest first. */
  attempts: { id: string; title: string; label?: string }[]
  /** Side-thread node: a plain ‹n/m› over all versions. */
  side: boolean
}

/**
 * Sibling info for every node of a path (nodes without siblings get none). `colors` = branch colors
 * (main path only). Unchanged entries keep their object identity.
 */
export function useSiblings(path: ChatNode[], nodes: ChatNode[] | undefined, colors?: Map<string, number>) {
  const t = useT()
  const cache = useRef(new Map<string, Siblings>())
  return useMemo(() => {
    const next = new Map<string, Siblings>()
    for (const n of path) {
      const sibs = siblingsOf(nodes ?? [], n)
      if (sibs.length < 2) continue
      // Retries share the user text, so the reply's opening tells them apart.
      const title = (s: ChatNode) => {
        const reply = firstLine(s.assistant.content)
        return (firstLine(s.user.text) || t('image.only')) + (reply ? ' → ' + reply : '')
      }
      const side = n.kind === 'side'
      const info: Siblings = {
        current: n.id,
        side,
        branches: side
          ? []
          : sibs
              .filter((s) => s.branch)
              .map((s) => ({ id: s.id, color: colors?.get(s.id) ?? GREY, title: title(s), label: s.label })),
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
 * The versions at a node's fork, at the right end of its reply footer. Main nodes: one dot per branch in
 * its color, then the attempts as one grey dot (‹n/m› among them while one is shown). Side nodes: ‹n/m›.
 */
export function SiblingSwitcher({ info, onSelect }: { info: Siblings; onSelect: (id: string) => void }) {
  const t = useT()
  const { branches, attempts, current } = info
  const at = attempts.findIndex((a) => a.id === current)
  const arrows = (prev: string, next: string) => (
    <>
      <IconButton label={prev} size="sm" onClick={() => onSelect(attempts[at - 1].id)} disabled={at <= 0}>
        <ChevronLeft size={15} />
      </IconButton>
      <span className="min-w-9 text-center text-xs text-muted tabular-nums select-none">
        {at + 1} / {attempts.length}
      </span>
      <IconButton
        label={next}
        size="sm"
        onClick={() => onSelect(attempts[at + 1].id)}
        disabled={at === attempts.length - 1}
      >
        <ChevronRight size={15} />
      </IconButton>
    </>
  )

  if (info.side) {
    return <div className="flex shrink-0 items-center">{arrows(t('switch.prevVersion'), t('switch.nextVersion'))}</div>
  }

  return (
    <div className="flex shrink-0 items-center">
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
      ) : attempts.length > 1 && at >= 0 ? (
        <>
          <span className="flex size-6 items-center justify-center" aria-hidden>
            <Stack current />
          </span>
          {arrows(t('switch.prevAttempt'), t('switch.nextAttempt'))}
        </>
      ) : (
        attempts.length > 1 && (
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
              <span className="tabular-nums">×{attempts.length}</span>
            </button>
          </Tip>
        )
      )}
    </div>
  )
}

/**
 * One branch (or a lone attempt): a dot in its color; the shown one is ringed. Tip: its label, then `title`.
 * A node that just became a branch pops in with a ripple in its color (`useUi().newBranches`).
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
        onClick={onClick}
        className={clsx(
          'flex size-6 items-center justify-center rounded-full transition-colors hover:bg-hover',
          'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
        )}
      >
        <span
          className={clsx(
            'relative size-2 rounded-full',
            current && 'outline-[1.5px] outline-offset-2 outline-text outline-solid',
            fresh && 'anim-branch-in',
          )}
          style={{ background: colorVar(color) }}
        >
          {fresh && <span aria-hidden className="anim-branch-ring absolute inset-0 rounded-full" style={{ background: colorVar(color) }} />}
        </span>
      </button>
    </Tip>
  )
}

/** Several attempts: one grey dot (like a lone attempt's; the count beside it tells them apart), ringed when one of them is shown. */
function Stack({ current }: { current?: boolean }) {
  return (
    <span
      className={clsx('size-2 rounded-full', current && 'outline-[1.5px] outline-offset-2 outline-text outline-solid')}
      style={{ background: colorVar(GREY) }}
    />
  )
}

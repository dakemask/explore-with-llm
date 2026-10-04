import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { shiftLocks, type AnchorMark } from '../../lib/anchor'
import { Button } from '../ui/Button'

/**
 * Edits an assistant reply's Markdown source in place. Ranges quoted by side questions (`locks`) are
 * shown greyed and can't be changed; edits elsewhere shift them. A transparent textarea sits over a
 * mirror that draws the text with the locked parts styled, so both wrap identically.
 */
export function AssistantEditor({
  initial,
  locks: initialLocks,
  onCancel,
  onSave,
}: {
  initial: string
  locks: AnchorMark[]
  onCancel: () => void
  onSave: (text: string, locks: AnchorMark[]) => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  const [locks, setLocks] = useState(initialLocks)
  const [blocked, setBlocked] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)
  /** Selection before the latest input, restored when an edit is refused. */
  const sel = useRef<[number, number]>([0, 0])
  const restore = useRef<[number, number] | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && restore.current) el.setSelectionRange(...restore.current)
    restore.current = null
  })

  useEffect(() => {
    if (!blocked) return
    const id = setTimeout(() => setBlocked(0), 2200)
    return () => clearTimeout(id)
  }, [blocked])

  const remember = () => {
    const el = ref.current
    if (el) sel.current = [el.selectionStart, el.selectionEnd]
  }

  const segments: { text: string; locked: boolean }[] = []
  let at = 0
  for (const l of [...locks].sort((a, b) => a.start - b.start)) {
    if (l.start < at) {
      // Overlapping locks: extend the previous locked segment.
      if (l.end > at) segments.push({ text: text.slice(at, l.end), locked: true })
      at = Math.max(at, l.end)
      continue
    }
    segments.push({ text: text.slice(at, l.start), locked: false })
    segments.push({ text: text.slice(l.start, l.end), locked: true })
    at = l.end
  }
  segments.push({ text: text.slice(at), locked: false })

  const shared =
    'px-4 py-3 font-mono text-[13.5px] leading-relaxed whitespace-pre-wrap [font-variant-ligatures:none] [overflow-wrap:anywhere]'
  const changed = text !== initial

  return (
    <div className="anim-fade rounded-xl border border-border-strong bg-surface shadow-composer">
      <div className="relative">
        <div aria-hidden className={clsx(shared, 'pointer-events-none text-text')}>
          {segments.map((s, i) =>
            s.locked ? (
              <span key={i} className="rounded-[3px] bg-subtle text-faint">
                {s.text}
              </span>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
          {/* Keeps the height in step with a trailing newline in the textarea. */}
          {'​'}
        </div>
        <textarea
          ref={ref}
          value={text}
          autoFocus
          spellCheck={false}
          onFocus={(e) => e.currentTarget.setSelectionRange(0, 0)}
          onSelect={remember}
          onKeyDown={(e) => {
            remember()
            if (e.key === 'Escape') onCancel()
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              if (changed) onSave(text, locks)
            }
          }}
          onChange={(e) => {
            const next = e.target.value
            const moved = shiftLocks(locks, text, next, e.target.selectionEnd)
            if (!moved) {
              restore.current = sel.current
              setBlocked((n) => n + 1)
              return
            }
            setLocks(moved)
            setText(next)
          }}
          className={clsx(
            shared,
            'absolute inset-0 block size-full resize-none overflow-hidden bg-transparent text-transparent caret-text focus:outline-none',
          )}
        />
      </div>
      <div className="flex items-center gap-2 border-t border-border py-2.5 pr-2.5 pl-4">
        <span className={clsx('min-w-0 flex-1 truncate text-xs transition-colors', blocked ? 'text-danger' : 'text-faint')}>
          {blocked ? t('msg.lockedBlocked') : locks.length ? t('msg.lockedHint') : t('msg.editReplyHint')}
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" variant="primary" onClick={() => onSave(text, locks)} disabled={!changed}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

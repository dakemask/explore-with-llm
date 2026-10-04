import clsx from 'clsx'
import { ArrowUp, Square } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { useAutosize } from '../../lib/hooks'

export function Composer({
  onSend,
  onStop,
  generating,
  disabled,
  placeholder,
  leading,
}: {
  onSend: (text: string) => void
  onStop: () => void
  generating: boolean
  disabled?: boolean
  placeholder?: string
  /** Shown at the left of the bottom bar. */
  leading?: ReactNode
}) {
  const t = useT()
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useAutosize(ref, text)

  const canSend = !disabled && !generating && text.trim().length > 0
  const submit = () => {
    if (!canSend) return
    onSend(text.trim())
    setText('')
  }

  return (
    <div
      className={clsx(
        'rounded-2xl border border-border bg-surface shadow-composer transition-colors',
        'focus-within:border-border-strong',
      )}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder={placeholder ?? t('chat.placeholder')}
        className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center gap-2 px-2.5 pb-2.5">
        <div className="min-w-0 flex-1">{leading}</div>
        {generating ? (
          <button
            onClick={onStop}
            aria-label={t('chat.stop')}
            className="flex size-8 items-center justify-center rounded-full bg-text text-bg transition-opacity hover:opacity-80"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canSend}
            aria-label={t('chat.send')}
            className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg transition-all hover:bg-accent-hover disabled:bg-subtle disabled:text-faint"
          >
            <ArrowUp size={17} strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  )
}

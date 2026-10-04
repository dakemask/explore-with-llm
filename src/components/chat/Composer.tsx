import clsx from 'clsx'
import { ArrowUp, Square } from 'lucide-react'
import { useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useAutosize } from '../../lib/hooks'

export function Composer({
  onSend,
  onStop,
  generating,
  disabled,
}: {
  onSend: (text: string) => void
  onStop: () => void
  generating: boolean
  disabled?: boolean
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
        placeholder={t('chat.placeholder')}
        className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center justify-end px-2.5 pb-2.5">
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

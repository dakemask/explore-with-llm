import clsx from 'clsx'
import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useT } from '../../i18n'
import { useAutosize } from '../../lib/hooks'
import type { ImageFile } from '../../lib/images'
import { AttachButton, AttachmentStrip, DropHint, useAttachments } from './Images'

export function Composer({
  onSend,
  onStop,
  generating,
  disabled,
  placeholder,
  leading,
  initialText = '',
  initialImages,
  onLeave,
  dropTarget,
}: {
  onSend: (text: string, images: ImageFile[]) => void
  onStop: () => void
  generating: boolean
  disabled?: boolean
  placeholder?: string
  /** Shown at the left of the bottom bar. */
  leading?: ReactNode
  /** Text to start with (read on mount); the cursor goes after it. */
  initialText?: string
  initialImages?: ImageFile[]
  /** Called on unmount with what the box still holds (to keep an unsent draft). */
  onLeave?: (text: string, images: ImageFile[]) => void
  /** Where dropped image files are accepted (e.g. the whole chat column); the box itself by default. */
  dropTarget?: RefObject<HTMLElement | null>
}) {
  const t = useT()
  const [text, setText] = useState(initialText)
  const ref = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const attachments = useAttachments(dropTarget ?? box, initialImages)

  useAutosize(ref, text)

  // Focus without scrolling: inside the scrolling side-question column the card reveals itself.
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  const held = useRef({ text, images: attachments.images, onLeave })
  held.current = { text, images: attachments.images, onLeave }
  useEffect(() => () => held.current.onLeave?.(held.current.text, held.current.images), [])

  const canSend = !disabled && !generating && (text.trim().length > 0 || attachments.images.length > 0)
  const submit = () => {
    if (!canSend) return
    onSend(text.trim(), attachments.images)
    setText('')
    attachments.clear()
  }

  return (
    <div
      ref={box}
      className={clsx(
        'relative rounded-2xl border border-border bg-surface shadow-composer transition-colors',
        'focus-within:border-border-strong',
      )}
    >
      <DropHint show={attachments.dragging} className="rounded-2xl" />
      <AttachmentStrip attachments={attachments} className="px-3.5 pt-3.5" />
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onFocus={(e) => {
          const end = e.currentTarget.value.length
          if (initialText && e.currentTarget.selectionStart === 0) e.currentTarget.setSelectionRange(end, end)
        }}
        onChange={(e) => setText(e.target.value)}
        onPaste={attachments.onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder={placeholder ?? t('chat.placeholder')}
        className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        <AttachButton onFiles={attachments.add} />
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

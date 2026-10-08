import clsx from 'clsx'
import { ArrowUp, RotateCcw, Square } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useT } from '../../i18n'
import { useAutosize } from '../../lib/hooks'
import type { ImageFile } from '../../lib/images'
import { Button } from '../ui/Button'
import { AttachButton, AttachmentStrip, DropHint, useAttachments } from './Images'

export function Composer({
  onSend,
  onStop,
  generating,
  disabled,
  placeholder,
  leading,
  modelRow,
  initialText = '',
  initialImages,
  onLeave,
  dropTarget,
  regenerate,
}: {
  onSend: (text: string, images: ImageFile[]) => void
  onStop: () => void
  generating: boolean
  disabled?: boolean
  placeholder?: string
  /** Shown at the left of the bottom bar. */
  leading?: ReactNode
  /** A row of its own above the bottom bar (side cards: the model picker, the bar is too narrow for it). */
  modelRow?: ReactNode
  /** Text to start with (read on mount); the cursor goes after it. */
  initialText?: string
  initialImages?: ImageFile[]
  /** Called on unmount with what the box still holds (to keep an unsent draft). */
  onLeave?: (text: string, images: ImageFile[]) => void
  /** Where dropped image files are accepted (e.g. the whole chat column); the box itself by default. */
  dropTarget?: RefObject<HTMLElement | null>
  /**
   * The last turn has no reply (`lacksReply`): sending is blocked and a regenerate button sits above the
   * box. `undefined` callback = shown but disabled (no model to send with).
   */
  regenerate?: { onClick?: () => void }
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

  const canSend = !disabled && !generating && !regenerate && (text.trim().length > 0 || attachments.images.length > 0)
  const submit = () => {
    if (!canSend) return
    onSend(text.trim(), attachments.images)
    setText('')
    attachments.clear()
  }

  return (
    <>
      {regenerate && (
        <div className="mb-2.5 flex justify-center">
          <Button
            size="sm"
            disabled={!regenerate.onClick}
            onClick={() => {
              regenerate.onClick?.()
              // The button goes away with the new attempt; typing continues here.
              ref.current?.focus({ preventScroll: true })
            }}
          >
            <RotateCcw size={13} />
            {t('msg.retry')}
          </Button>
        </div>
      )}
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
          data-composer
          rows={1}
          value={text}
          onFocus={(e) => {
            const end = e.currentTarget.value.length
            if (initialText && e.currentTarget.selectionStart === 0) e.currentTarget.setSelectionRange(end, end)
          }}
          onChange={(e) => setText(e.target.value)}
          onPaste={attachments.onPaste}
          // Nothing typed (empty, or still the starting text): Escape may close what holds the box.
          data-pristine={(!attachments.images.length && (text === initialText || !text.trim())) || undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder ?? t('chat.placeholder')}
          className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed placeholder:text-faint focus:outline-none"
        />
        {modelRow && <div className="flex min-w-0 px-2.5">{modelRow}</div>}
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
    </>
  )
}

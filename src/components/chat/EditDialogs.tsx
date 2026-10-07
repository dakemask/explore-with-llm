import { useEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useT } from '../../i18n'
import { useAutosize } from '../../lib/hooks'
import { useStoredImages, type ImageFile } from '../../lib/images'
import { Button } from '../ui/Button'
import { confirmDialog, Dialog } from '../ui/Dialog'
import { AttachButton, AttachmentStrip, DropHint, useAttachments } from './Images'

/** The editor boxes grow up to this share of the window, then scroll. */
const maxHeight = () => Math.round(window.innerHeight * 0.6)

/**
 * The dialog both editors live in. Closing it (Esc, outside click, ✕, Cancel) asks first when something
 * was changed. Mounted only while editing, so each opening starts from the message as it is.
 */
function EditDialog({
  title,
  dirty,
  onClose,
  className,
  children,
}: {
  title: string
  dirty: boolean
  /** Closes it; `done` = sent / saved (focus then goes to the input box, not back to the edit button). */
  onClose: () => void
  className: string
  children: (cancel: () => void, done: () => void) => ReactNode
}) {
  const t = useT()
  const cancel = async () => {
    if (dirty && !(await confirmDialog(t('msg.discardEdit')))) return
    onClose()
  }
  const sent = useRef(false)
  const done = () => {
    sent.current = true
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && void cancel()}
      title={title}
      className={className}
      initialFocus="textarea"
      toComposer={() => sent.current}
    >
      {children(cancel, done)}
    </Dialog>
  )
}

/** Edits a user message (text and images). Sending makes a new attempt beside the original. */
export function UserEditDialog({
  initial,
  initialImages,
  onClose,
  onSend,
}: {
  initial: string
  initialImages?: string[]
  onClose: () => void
  onSend: (text: string, images: ImageFile[]) => void
}) {
  const t = useT()
  const [dirty, setDirty] = useState(false)
  return (
    <EditDialog title={t('msg.editTitle')} dirty={dirty} onClose={onClose} className="max-w-2xl">
      {(cancel, done) => (
        <UserEditBody
          initial={initial}
          initialImages={initialImages}
          onDirty={setDirty}
          onCancel={cancel}
          onSend={(text, images) => {
            done()
            onSend(text, images)
          }}
        />
      )}
    </EditDialog>
  )
}

// Inside the dialog (rendered in its portal), so the drop zone's element exists when it's set up.
function UserEditBody({
  initial,
  initialImages,
  onDirty,
  onCancel,
  onSend,
}: {
  initial: string
  initialImages?: string[]
  onDirty: (dirty: boolean) => void
  onCancel: () => void
  onSend: (text: string, images: ImageFile[]) => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const attachments = useAttachments(box)
  const stored = useStoredImages(initialImages)
  const loaded = useRef<string[] | null>(null)
  if (stored && !loaded.current) {
    loaded.current = stored.map((i) => i.id)
    if (stored.length) attachments.reset(stored)
  }
  useAutosize(ref, text, maxHeight())
  const ids = attachments.images.map((i) => i.id).join(' ')
  const dirty = text !== initial || (!!loaded.current && ids !== loaded.current.join(' '))
  useEffect(() => onDirty(dirty), [dirty, onDirty])
  const canSend = text.trim().length > 0 || attachments.images.length > 0
  const submit = () => {
    if (canSend) onSend(text.trim(), attachments.images)
  }

  return (
    <div ref={box} className="relative flex min-h-0 flex-col">
      <DropHint show={attachments.dragging} className="rounded-b-xl" />
      <div className="min-h-0 overflow-y-auto px-5 pt-4">
        <AttachmentStrip attachments={attachments} className="mb-3" />
        <textarea
          ref={ref}
          value={text}
          onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
          onChange={(e) => setText(e.target.value)}
          onPaste={attachments.onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          className="block min-h-24 w-full resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2 px-4 py-3.5">
        <AttachButton onFiles={attachments.add} />
        <span className="min-w-0 flex-1 truncate text-xs text-faint">{t('msg.editHint')}</span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" variant="primary" onClick={submit} disabled={!canSend}>
          {t('common.send')}
        </Button>
      </div>
    </div>
  )
}

/** Edits an assistant reply's Markdown source. Saving makes a new version beside the original. */
export function AssistantEditDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: string
  onClose: () => void
  onSave: (text: string) => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  const changed = text !== initial && text.trim().length > 0
  const save = (done: () => void) => {
    if (!changed) return
    done()
    onSave(text)
  }

  return (
    <EditDialog title={t('msg.editReply')} dirty={text !== initial} onClose={onClose} className="max-w-3xl">
      {(cancel, done) => (
        <>
          <div className="min-h-0 overflow-y-auto px-5 pt-4">
            <GrowingTextarea
              value={text}
              spellCheck={false}
              placeholder={t('msg.editReplyPlaceholder')}
              onFocus={(e) => e.currentTarget.setSelectionRange(0, 0)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  save(done)
                }
              }}
              className="block min-h-24 w-full resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 font-mono text-[13.5px] leading-relaxed [font-variant-ligatures:none] [overflow-wrap:anywhere] placeholder:font-sans placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 px-4 py-3.5">
            <span className="min-w-0 flex-1 truncate pl-1 text-xs text-faint">{t('msg.editReplyHint')}</span>
            <Button size="sm" variant="ghost" onClick={cancel}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => save(done)} disabled={!changed}>
              {t('common.save')}
            </Button>
          </div>
        </>
      )}
    </EditDialog>
  )
}

/** A textarea growing with its text up to `maxHeight` (its own component: it renders inside the dialog's portal). */
function GrowingTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutosize(ref, props.value, maxHeight())
  return <textarea ref={ref} {...props} />
}

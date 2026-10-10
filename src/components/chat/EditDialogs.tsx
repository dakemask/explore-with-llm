import clsx from 'clsx'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useT } from '../../i18n'
import { useAutosize } from '../../lib/hooks'
import { useStoredImages, type ImageFile } from '../../lib/images'
import { Button } from '../ui/Button'
import { confirmDialog, Dialog } from '../ui/Dialog'
import { Label } from '../ui/Field'
import { AttachButton, AttachmentStrip, DropHint, useAttachments } from './Images'

/** The editor boxes grow up to this share of the window, then scroll. */
const maxHeight = () => Math.round(window.innerHeight * 0.6)

const editBox =
  'block w-full resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 leading-relaxed placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none'

/**
 * The dialog the editors live in. Closing it (Esc, outside click, ✕, Cancel) asks first when something
 * was changed. Mounted only while editing, so each opening starts from the message as it is.
 */
function EditDialog({
  title,
  dirty,
  onClose,
  className,
  initialFocus = 'textarea',
  children,
}: {
  title: string
  dirty: boolean
  /** Closes it; `done` = sent / saved (focus then goes to the input box, not back to the edit button). */
  onClose: () => void
  className: string
  /** Selector of what gets focus first. */
  initialFocus?: string
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
      initialFocus={initialFocus}
      toComposer={() => sent.current}
    >
      {children(cancel, done)}
    </Dialog>
  )
}

/**
 * Edits a user message (text and images) and, for a first turn, its system message (`system`; '' = none).
 * Sending makes a new attempt beside the original.
 */
export function UserEditDialog({
  initial,
  initialImages,
  system,
  focusSystem,
  onClose,
  onSend,
}: {
  initial: string
  initialImages?: string[]
  /** First turns only: the system message it was sent with ('' = none). */
  system?: string
  /** Opened from the system message: its box gets focus. */
  focusSystem?: boolean
  onClose: () => void
  onSend: (text: string, images: ImageFile[], system?: string) => void
}) {
  const t = useT()
  const [dirty, setDirty] = useState(false)
  return (
    <EditDialog
      title={t('msg.editTitle')}
      dirty={dirty}
      onClose={onClose}
      className="max-w-2xl"
      initialFocus={focusSystem ? 'textarea[data-edit-system]' : 'textarea[data-edit-user]'}
    >
      {(cancel, done) => (
        <UserEditBody
          initial={initial}
          initialImages={initialImages}
          system={system}
          onDirty={setDirty}
          onCancel={cancel}
          onSend={(text, images, system) => {
            done()
            onSend(text, images, system)
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
  system: initialSystem,
  onDirty,
  onCancel,
  onSend,
}: {
  initial: string
  initialImages?: string[]
  system?: string
  onDirty: (dirty: boolean) => void
  onCancel: () => void
  onSend: (text: string, images: ImageFile[], system?: string) => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  const [system, setSystem] = useState(initialSystem ?? '')
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
  const dirty =
    text !== initial ||
    (initialSystem !== undefined && system !== initialSystem) ||
    (!!loaded.current && ids !== loaded.current.join(' '))
  useEffect(() => onDirty(dirty), [dirty, onDirty])
  const canSend = text.trim().length > 0 || attachments.images.length > 0
  const submit = () => {
    if (canSend) onSend(text.trim(), attachments.images, initialSystem === undefined ? undefined : system.trim())
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div ref={box} className="relative flex min-h-0 flex-col">
      <DropHint show={attachments.dragging} className="rounded-b-xl" />
      <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-1">
        {initialSystem !== undefined && (
          <>
            <Label>{t('system.title')}</Label>
            <GrowingTextarea
              data-edit-system
              value={system}
              placeholder={t('system.placeholder')}
              onFocus={(e) => e.currentTarget.setSelectionRange(system.length, system.length)}
              onChange={(e) => setSystem(e.target.value)}
              className={clsx(editBox, 'mb-4 min-h-16 text-[14px]')}
            />
            <Label>{t('system.userTitle')}</Label>
          </>
        )}
        <AttachmentStrip attachments={attachments} className="mb-3" />
        <textarea
          ref={ref}
          data-edit-user
          value={text}
          onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
          onChange={(e) => setText(e.target.value)}
          onPaste={attachments.onPaste}
          onKeyDown={onKeyDown}
          className={clsx(editBox, 'min-h-24 text-[15px]')}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2 px-4 pt-2.5 pb-3.5">
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

/** Edits the system message of a first turn not sent yet (nothing is sent: the first message takes it along). */
export function SystemEditDialog({
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
  const save = (done: () => void) => {
    done()
    onSave(text.trim())
  }
  return (
    <EditDialog title={t('system.title')} dirty={text !== initial} onClose={onClose} className="max-w-2xl">
      {(cancel, done) => (
        <>
          <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-1">
            <GrowingTextarea
              value={text}
              placeholder={t('system.placeholder')}
              onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  save(done)
                }
              }}
              className={clsx(editBox, 'min-h-24 text-[14px]')}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 px-4 pt-2.5 pb-3.5">
            <span className="min-w-0 flex-1 truncate pl-1 text-xs text-faint">{t('system.newHint')}</span>
            <Button size="sm" variant="ghost" onClick={cancel}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => save(done)} disabled={text === initial}>
              {t('common.save')}
            </Button>
          </div>
        </>
      )}
    </EditDialog>
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
          <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-1">
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
          <div className="flex shrink-0 items-center gap-2 px-4 pt-2.5 pb-3.5">
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

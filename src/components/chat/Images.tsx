import * as RD from '@radix-ui/react-dialog'
import clsx from 'clsx'
import { ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type RefObject } from 'react'
import { useT } from '../../i18n'
import { imageUrl, prepareImage, useStoredImages, type ImageFile } from '../../lib/images'
import { IconButton } from '../ui/Button'

/**
 * Images attached in an input box: added by the button, pasting or dropping files on `dropTarget`.
 * Unreadable files show a short error instead.
 */
export function useAttachments(dropTarget: RefObject<HTMLElement | null>, initial: ImageFile[] = []) {
  const t = useT()
  const [images, setImages] = useState<ImageFile[]>(initial)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const errorTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(errorTimer.current), [])

  const add = async (files: File[]) => {
    const prepared = await Promise.all(files.map(prepareImage))
    const ok = prepared.filter((p): p is ImageFile => !!p)
    if (ok.length) setImages((list) => [...list, ...ok])
    const bad = files.filter((_, i) => !prepared[i])
    if (bad.length) {
      setError(t('image.unreadable', { name: bad.map((f) => f.name || f.type).join(', ') }))
      clearTimeout(errorTimer.current)
      errorTimer.current = setTimeout(() => setError(''), 4000)
    }
  }
  const latestAdd = useRef(add)
  latestAdd.current = add

  useEffect(() => {
    const el = dropTarget.current
    if (!el) return
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      if (--depth <= 0) {
        depth = 0
        setDragging(false)
      }
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      // A nested input box (the user-message editor) takes its own drops.
      e.stopPropagation()
      depth = 0
      setDragging(false)
      void latestAdd.current([...e.dataTransfer!.files])
    }
    el.addEventListener('dragenter', enter)
    el.addEventListener('dragover', over)
    el.addEventListener('dragleave', leave)
    el.addEventListener('drop', drop)
    return () => {
      el.removeEventListener('dragenter', enter)
      el.removeEventListener('dragover', over)
      el.removeEventListener('dragleave', leave)
      el.removeEventListener('drop', drop)
    }
  }, [dropTarget])

  /** Pasted image files are attached, unless the clipboard also has plain text (e.g. cells copied from a sheet). */
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (!files.length || e.clipboardData.types.includes('text/plain')) return
    e.preventDefault()
    void add(files)
  }

  return {
    images,
    error,
    dragging,
    add,
    onPaste,
    remove: (id: string) => setImages((list) => list.filter((i) => i.id !== id)),
    clear: () => setImages([]),
    reset: (list: ImageFile[]) => setImages(list),
  }
}

export type Attachments = ReturnType<typeof useAttachments>

/** The "add images" button with its hidden file picker. */
export function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <IconButton label={t('image.add')} onClick={() => input.current?.click()}>
        <ImagePlus size={17} />
      </IconButton>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </>
  )
}

/** Thumbnails of the images attached in an input box, plus the last error. */
export function AttachmentStrip({ attachments, className }: { attachments: Attachments; className?: string }) {
  const t = useT()
  const [viewing, setViewing] = useState<ImageFile | null>(null)
  const { images, error, remove } = attachments
  if (!images.length && !error) return null
  return (
    <div className={className}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="group/thumb relative">
              <button
                onClick={() => setViewing(img)}
                aria-label={t('image.view')}
                className="block size-16 overflow-hidden rounded-lg border border-border bg-subtle"
              >
                <img src={imageUrl(img)} alt="" className="size-full object-cover" draggable={false} />
              </button>
              <button
                onClick={() => remove(img.id)}
                aria-label={t('image.remove')}
                title={t('image.remove')}
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-muted opacity-0 shadow-sm transition-opacity group-hover/thumb:opacity-100 hover:text-text focus-visible:opacity-100"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="mt-1.5 text-xs text-danger">{error}</div>}
      <ImageViewer image={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

/** Highlight shown over an input box while files are dragged over its drop area. */
export function DropHint({ show, className }: { show: boolean; className?: string }) {
  const t = useT()
  if (!show) return null
  return (
    <div
      className={clsx(
        'pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-accent-soft/90 text-sm font-medium text-accent',
        className,
      )}
    >
      {t('image.drop')}
    </div>
  )
}

/** A user message's images, above its bubble; click to view full size. */
export function MessageImages({ ids }: { ids: string[] }) {
  const t = useT()
  const images = useStoredImages(ids)
  const [viewing, setViewing] = useState<ImageFile | null>(null)
  return (
    <div className="mb-1.5 flex max-w-[85%] flex-wrap justify-end gap-2">
      {(images ?? []).map((img) => {
        // Small images keep their size; larger ones are shown 144 px high.
        const h = Math.min(144, img.height)
        return (
          <button
            key={img.id}
            onClick={() => setViewing(img)}
            aria-label={t('image.view')}
            className="overflow-hidden rounded-xl border border-border bg-subtle transition-opacity hover:opacity-90"
          >
            <img
              src={imageUrl(img)}
              alt=""
              draggable={false}
              className="block max-w-60 object-cover"
              style={{ height: h, width: (h * img.width) / img.height }}
            />
          </button>
        )
      })}
      <ImageViewer image={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

/** Full-size view of one image; click anywhere or Esc to close. */
export function ImageViewer({ image, onClose }: { image: ImageFile | null; onClose: () => void }) {
  const t = useT()
  return (
    <RD.Root open={!!image} onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-40 bg-black/70" />
        <RD.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).focus()
          }}
          tabIndex={-1}
          onClick={onClose}
          className="anim-fade fixed inset-0 z-50 flex items-center justify-center p-8 focus:outline-none"
        >
          <RD.Title className="sr-only">{t('image.view')}</RD.Title>
          {image && (
            <img
              src={imageUrl(image)}
              alt=""
              className="max-h-full max-w-full rounded-lg object-contain shadow-pop"
            />
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

import { AlertCircle, X } from 'lucide-react'
import { create } from 'zustand'
import { useT } from '../../i18n'
import { IconButton } from './Button'

/**
 * Error notifications: stacked at the top right, each stays until closed. For failed actions the user just
 * took (import, reading an image, fetching models, saving a config); errors of a chat request stay in the chat.
 */
type Toast = { id: number; title: string; details: string[] }

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }))
let nextId = 0

export function notifyError(title: string, details: string | string[] = []) {
  const toast = { id: ++nextId, title, details: [details].flat().filter(Boolean) }
  const same = (t: Toast) => t.title === toast.title && t.details.join('\n') === toast.details.join('\n')
  // A problem that repeats (e.g. a deleted naming model, every new conversation) shows once until closed.
  useToasts.setState((s) => (s.toasts.some(same) ? s : { toasts: [...s.toasts, toast] }))
}

const dismiss = (id: number) => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))

/** True for events inside a notification, so dialogs don't treat clicks on one as clicking outside. */
export const inToast = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-toast]')

/** Mount once at the app root. */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts)
  if (!toasts.length) return null
  return (
    // Modal dialogs disable pointer events on the page; notifications stay clickable above them.
    <div data-toast className="pointer-events-auto fixed top-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function ToastCard({ toast }: { toast: Toast }) {
  const t = useT()
  return (
    <div
      role="alert"
      className="anim-drawer flex gap-2.5 rounded-lg border border-danger/25 bg-surface py-2.5 pr-1.5 pl-3.5 text-[13px] shadow-pop"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1 py-px">
        <div className="font-medium text-danger">{toast.title}</div>
        {toast.details.length === 1 && <div className="mt-0.5 break-words text-muted">{toast.details[0]}</div>}
        {toast.details.length > 1 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 break-words text-muted">
            {toast.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </div>
      <IconButton label={t('common.close')} size="sm" onClick={() => dismiss(toast.id)}>
        <X size={15} />
      </IconButton>
    </div>
  )
}

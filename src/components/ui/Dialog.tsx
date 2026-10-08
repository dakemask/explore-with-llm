import * as RD from '@radix-ui/react-dialog'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { useT } from '../../i18n'
import { focusComposer } from '../../lib/focus'
import { Button, IconButton } from './Button'
import { inToast } from './Toast'

/**
 * Our dialogs are opened from app state, not by a Radix `Trigger`, so Radix doesn't know where to hand
 * focus back on close (it dropped it on the page). This remembers what had focus when the dialog opened
 * and returns to it if it's still there; `toComposer()` true sends it to that place's input box instead
 * (see `lib/focus.ts`).
 */
function useReturnFocus(toComposer?: () => boolean) {
  const opener = useRef<{ el: HTMLElement; side: Element | null } | null>(null)
  return {
    remember: () => {
      let el = document.activeElement
      // Opened from a menu item: the item goes away with its menu, so return to the menu's button.
      const menu = el?.closest('[role="menu"]')
      const trigger = menu && document.getElementById(menu.getAttribute('aria-labelledby') ?? '')
      if (trigger) el = trigger
      opener.current =
        el instanceof HTMLElement && el !== document.body ? { el, side: el.closest('[data-side-column]') } : null
    },
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault()
      const o = opener.current
      if (toComposer?.()) focusComposer(o?.side)
      else if (o?.el.isConnected) o.el.focus({ preventScroll: true })
    },
  }
}

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
  initialFocus,
  toComposer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  children: ReactNode
  className?: string
  /** Selector of the element to focus on open (e.g. a search box); the panel itself otherwise. */
  initialFocus?: string
  /** Asked on close: true = focus the input box of the place it was opened from, not its opener. */
  toComposer?: () => boolean
}) {
  const t = useT()
  const focus = useReturnFocus(toComposer)
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] dark:bg-black/50" />
        <RD.Content
          aria-describedby={undefined}
          // Focus the panel itself rather than the first button, so the close button's tooltip doesn't pop up.
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            focus.remember()
            const panel = e.currentTarget as HTMLElement
            ;((initialFocus && panel.querySelector<HTMLElement>(initialFocus)) || panel).focus()
          }}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          onInteractOutside={(e) => inToast(e.target) && e.preventDefault()}
          className={clsx(
            'anim-pop fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl border border-border bg-surface shadow-pop focus:outline-none',
            className ?? 'max-w-md',
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
            <RD.Title className="text-[15px] font-semibold">{title}</RD.Title>
            <RD.Close asChild>
              <IconButton label={t('common.close')} size="sm">
                <X size={16} />
              </IconButton>
            </RD.Close>
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

// ---- Imperative confirm / prompt dialogs ----

type Pending = { id: number } & (
  | { kind: 'confirm'; message: string; danger?: boolean; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; message: string; initial: string; placeholder?: string; resolve: (value: string | null) => void }
)

const usePending = create<{ pending: Pending | null }>(() => ({ pending: null }))
let nextId = 0

export function confirmDialog(message: string, opts?: { danger?: boolean }) {
  return new Promise<boolean>((resolve) =>
    usePending.setState({ pending: { id: ++nextId, kind: 'confirm', message, danger: opts?.danger, resolve } }),
  )
}

export function promptDialog(message: string, initial = '', opts?: { placeholder?: string }) {
  return new Promise<string | null>((resolve) =>
    usePending.setState({ pending: { id: ++nextId, kind: 'prompt', message, initial, placeholder: opts?.placeholder, resolve } }),
  )
}

/** Mount once at the app root. */
export function DialogHost() {
  const pending = usePending((s) => s.pending)
  return pending ? <PendingDialog key={pending.id} pending={pending} /> : null
}

function PendingDialog({ pending }: { pending: Pending }) {
  const t = useT()
  const [value, setValue] = useState(pending.kind === 'prompt' ? pending.initial : '')
  const focus = useReturnFocus()
  // On the first render, before the autoFocus inside takes focus (Radix's open event then doesn't fire).
  useState(focus.remember)
  const close = (ok: boolean) => {
    usePending.setState({ pending: null })
    if (pending.kind === 'prompt') pending.resolve(ok ? value : null)
    else pending.resolve(ok)
  }
  return (
    <RD.Root open onOpenChange={(o) => !o && close(false)}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-40 bg-black/30 dark:bg-black/50" />
        <RD.Content
          aria-describedby={undefined}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          onInteractOutside={(e) => inToast(e.target) && e.preventDefault()}
          className="anim-pop fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-pop focus:outline-none"
        >
          <RD.Title className="text-sm leading-relaxed">{pending.message}</RD.Title>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              close(true)
            }}
          >
            {pending.kind === 'prompt' && (
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder={pending.placeholder}
                className="mt-3 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
              />
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => close(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                type="submit"
                variant="primary"
                autoFocus={pending.kind !== 'prompt'}
                className={pending.kind === 'confirm' && pending.danger ? '!bg-danger !text-white' : undefined}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </form>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

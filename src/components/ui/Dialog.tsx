import * as RD from '@radix-ui/react-dialog'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { useT } from '../../i18n'
import { Button, IconButton } from './Button'

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  children: ReactNode
  className?: string
}) {
  const t = useT()
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] dark:bg-black/50" />
        <RD.Content
          aria-describedby={undefined}
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
  | { kind: 'prompt'; message: string; initial: string; resolve: (value: string | null) => void }
)

const usePending = create<{ pending: Pending | null }>(() => ({ pending: null }))
let nextId = 0

export function confirmDialog(message: string, opts?: { danger?: boolean }) {
  return new Promise<boolean>((resolve) =>
    usePending.setState({ pending: { id: ++nextId, kind: 'confirm', message, danger: opts?.danger, resolve } }),
  )
}

export function promptDialog(message: string, initial = '') {
  return new Promise<string | null>((resolve) =>
    usePending.setState({ pending: { id: ++nextId, kind: 'prompt', message, initial, resolve } }),
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
  const close = (ok: boolean) => {
    usePending.setState({ pending: null })
    if (pending.kind === 'confirm') pending.resolve(ok)
    else pending.resolve(ok ? value : null)
  }
  return (
    <RD.Root open onOpenChange={(o) => !o && close(false)}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-40 bg-black/30 dark:bg-black/50" />
        <RD.Content
          aria-describedby={undefined}
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
                className="mt-3 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
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
                autoFocus={pending.kind === 'confirm'}
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

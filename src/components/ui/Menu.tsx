import * as DM from '@radix-ui/react-dropdown-menu'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export const MenuRoot = DM.Root
export const MenuTrigger = DM.Trigger

export function MenuContent({
  children,
  align = 'start',
  className,
}: {
  children: ReactNode
  align?: 'start' | 'end' | 'center'
  className?: string
}) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={clsx(
          'anim-menu z-50 min-w-40 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-pop',
          'max-h-[var(--radix-dropdown-menu-content-available-height)]',
          className,
        )}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  icon,
  danger,
  selected,
}: {
  children: ReactNode
  onSelect: () => void
  icon?: ReactNode
  danger?: boolean
  selected?: boolean
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={clsx(
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none select-none',
        danger ? 'text-danger data-highlighted:bg-danger-soft' : 'text-text data-highlighted:bg-hover',
        selected && 'font-medium text-accent',
      )}
    >
      {icon && <span className="flex size-4 items-center justify-center opacity-80">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DM.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{children}</DM.Label>
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />
}

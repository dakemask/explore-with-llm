import * as RP from '@radix-ui/react-popover'
import clsx from 'clsx'
import type { ReactNode, Ref } from 'react'

export const PopoverRoot = RP.Root
export const PopoverTrigger = RP.Trigger
export const PopoverClose = RP.Close

/** Floating panel for small forms (unlike Menu, it can hold any controls). */
export function PopoverContent({
  children,
  align = 'start',
  side = 'top',
  className,
  ref,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onFocusOutside,
}: {
  children: ReactNode
  align?: 'start' | 'end' | 'center'
  side?: 'top' | 'bottom'
  className?: string
  ref?: Ref<HTMLDivElement>
} & Pick<RP.PopoverContentProps, 'onOpenAutoFocus' | 'onCloseAutoFocus' | 'onFocusOutside'>) {
  return (
    <RP.Portal>
      <RP.Content
        ref={ref}
        align={align}
        side={side}
        sideOffset={8}
        collisionPadding={12}
        // By default focus stays on the trigger, so the composer's text box doesn't lose its place for nothing.
        onOpenAutoFocus={onOpenAutoFocus ?? ((e) => e.preventDefault())}
        onCloseAutoFocus={onCloseAutoFocus}
        onFocusOutside={onFocusOutside}
        className={clsx(
          'anim-menu z-50 overflow-y-auto rounded-xl border border-border bg-surface shadow-pop focus:outline-none',
          'max-h-[var(--radix-popover-content-available-height)]',
          className,
        )}
      >
        {children}
      </RP.Content>
    </RP.Portal>
  )
}

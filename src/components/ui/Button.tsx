import * as Tooltip from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import { CircleHelp } from 'lucide-react'
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40',
  secondary: 'bg-surface text-text border border-border hover:bg-hover disabled:opacity-50',
  ghost: 'text-muted hover:bg-hover hover:text-text disabled:opacity-40',
  danger: 'text-danger hover:bg-danger-soft disabled:opacity-40',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none',
        'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md'
  active?: boolean
  children: ReactNode
}

/** Square icon-only button with a tooltip; `label` doubles as the accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, className, type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type={type}
          aria-label={label}
          className={clsx(
            'inline-flex shrink-0 items-center justify-center rounded-md text-muted transition-colors',
            'hover:bg-hover hover:text-text disabled:opacity-40 disabled:hover:bg-transparent',
            'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
            size === 'sm' ? 'size-7' : 'size-8',
            active && 'bg-active text-text',
            className,
          )}
          {...rest}
        />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="anim-fade z-50 rounded-md bg-text px-2 py-1 text-xs text-bg shadow-pop"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
})

/** Tooltip around any element. `open` / `onOpenChange` make it controlled. */
export function Tip({
  content,
  children,
  open,
  onOpenChange,
  contentRef,
}: {
  content: ReactNode
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  contentRef?: Ref<HTMLDivElement>
}) {
  return (
    <Tooltip.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          ref={contentRef}
          side="top"
          sideOffset={6}
          className="anim-fade z-50 max-w-72 rounded-md bg-text px-2 py-1 text-xs leading-relaxed text-bg shadow-pop"
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/**
 * A small ⓘ-style question mark explaining the thing next to it on hover. A click pins the explanation
 * open until the next click on it, a click anywhere else, or Escape.
 */
export function HelpTip({ content, className }: { content: ReactNode; className?: string }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!triggerRef.current?.contains(target) && !contentRef.current?.contains(target)) setPinned(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(false)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [pinned])
  return (
    <Tip content={content} open={pinned || hover} onOpenChange={setHover} contentRef={contentRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={typeof content === 'string' ? content : undefined}
        aria-pressed={pinned}
        onClick={(e) => {
          // Inside a clickable row (e.g. a label or menu item) the click is only for the explanation.
          e.preventDefault()
          e.stopPropagation()
          setPinned((p) => !p)
        }}
        className={clsx(
          'inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-faint transition-colors',
          'hover:text-text focus-visible:text-text focus-visible:outline-none',
          pinned && 'text-text',
          className,
        )}
      >
        <CircleHelp size={13} />
      </button>
    </Tip>
  )
}

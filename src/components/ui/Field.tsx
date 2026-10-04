import clsx from 'clsx'
import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { HelpTip } from './Button'

const fieldBase =
  'w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-faint transition-colors ' +
  'hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(fieldBase, 'h-9', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(fieldBase, 'resize-none py-2 leading-relaxed', className)} {...rest} />
  },
)

/** A field's title. `hint`: always-visible line below it (consequences); `help`: hover ⓘ (explanations). */
export function Label({
  children,
  hint,
  help,
  action,
}: {
  children: ReactNode
  hint?: ReactNode
  help?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-1.5 flex items-end justify-between gap-2">
      <div>
        <div className="flex items-center gap-1 text-[13px] font-medium text-text">
          {children}
          {help && <HelpTip content={help} />}
        </div>
        {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
      </div>
      {action}
    </div>
  )
}

/** Pill-style single choice, used for small option sets like theme / language. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  onChange: (v: T) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={clsx('inline-flex rounded-lg bg-subtle p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-3 py-1 text-[13px] transition-all disabled:opacity-40',
            value === o.value ? 'bg-surface font-medium text-text shadow-sm' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

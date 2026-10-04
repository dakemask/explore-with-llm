import clsx from 'clsx'

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Accessible name. */
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-border-strong',
      )}
    >
      <span
        className={clsx(
          'size-4 rounded-full shadow-sm transition-transform',
          checked ? 'translate-x-[18px] bg-accent-fg' : 'translate-x-0.5 bg-surface dark:bg-faint',
        )}
      />
    </button>
  )
}

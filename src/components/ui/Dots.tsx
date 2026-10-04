import clsx from 'clsx'

/** Three bouncing dots: something is on its way (a reply, a title). */
export function Dots({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={clsx('inline-flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-faint"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  )
}

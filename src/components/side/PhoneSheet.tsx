import clsx from 'clsx'
import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Layer } from '../ui/Layer'

/**
 * Phones (Product decisions › Phone): the expanded side question / note in a sheet rising from the bottom
 * (90% of the screen) instead of a card in the column. A tap on the strip of chat above it closes it; Escape
 * goes through `onEscape`, like the column's card. Marked `data-side-column` so the column's Escape rules
 * (a card's own untouched input box) hold here too.
 */
export function PhoneSheet({
  id,
  color,
  leaving,
  onClose,
  onEscape,
  children,
}: {
  id: string
  color: string
  leaving: boolean
  onClose: () => void
  onEscape: (e: KeyboardEvent) => void
  children: (card: RefObject<HTMLDivElement | null>) => ReactNode
}) {
  const card = useRef<HTMLDivElement>(null)
  return (
    <div className={clsx('fixed inset-0 z-30', leaving && 'pointer-events-none')}>
      <div aria-hidden className="anim-fade absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <Layer
        ref={card}
        key={id}
        data-side-column
        data-expanded={id}
        onEscapeKeyDown={onEscape}
        className={clsx(
          'anim-sheet absolute inset-x-0 bottom-0 flex h-[90%] flex-col rounded-t-2xl border-t border-border-strong bg-surface shadow-pop transition-opacity duration-200',
          leaving && 'opacity-0',
        )}
        style={{ '--node': color } as CSSProperties}
      >
        {children(card)}
      </Layer>
    </div>
  )
}

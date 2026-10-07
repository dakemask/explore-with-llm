import clsx from 'clsx'
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * A vertical drag handle on a pane's inner edge. `edge`: which side of the handle the pane is on (dragging
 * away from the pane widens it). Double-click resets; arrow keys step by 16 px. Our own: the panes aren't
 * flex panels a panel library could own (the side-question column sits inside the chat's scroll area and is
 * placed by `columnFrame`), so a handle is all that's shared.
 */
export function ResizeHandle({
  label,
  edge,
  width,
  min,
  max,
  onResize,
  onReset,
  className,
  style,
}: {
  label: string
  edge: 'left' | 'right'
  width: number
  min: number
  max: number
  onResize: (width: number) => void
  onReset: () => void
  className?: string
  style?: CSSProperties
}) {
  const start = useRef<{ x: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dir = edge === 'left' ? 1 : -1
  const clamp = (px: number) => Math.round(Math.min(max, Math.max(min, px)))

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, width }
    setDragging(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    onResize(clamp(start.current.width + (e.clientX - start.current.x) * dir))
  }
  const end = () => {
    start.current = null
    setDragging(false)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : 0
    if (!step) return
    e.preventDefault()
    onResize(clamp(width + step * dir))
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={clsx(
        'group/resize absolute top-0 z-20 flex h-full w-2 cursor-col-resize touch-none justify-center focus-visible:outline-none',
        className,
      )}
      style={style}
    >
      <span
        className={clsx(
          'h-full w-0.5 transition-colors',
          dragging ? 'bg-accent' : 'group-hover/resize:bg-accent/60 group-focus-visible/resize:bg-accent/60',
        )}
      />
      {/* While dragging: keep the column cursor everywhere and don't select text. */}
      {dragging && <style>{'body{cursor:col-resize;user-select:none}'}</style>}
    </div>
  )
}

import { MessageSquareText, MessageSquareQuote } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { SideAnchor } from '../../db'
import { useT } from '../../i18n'
import { rangeToSource } from '../../lib/anchor'
import { MenuContent, MenuItem, MenuLabel, MenuRoot, MenuTrigger } from '../ui/Menu'

/**
 * Floating "Ask" button over a text selection inside one assistant reply (an element with
 * `data-anchor-root`). `contentOf` returns that reply's source text.
 */
export function SelectionAsk({
  containerRef,
  contentOf,
  onAsk,
}: {
  containerRef: RefObject<HTMLElement | null>
  contentOf: (nodeId: string) => string | undefined
  onAsk: (nodeId: string, anchor: SideAnchor) => void
}) {
  const t = useT()
  const [hit, setHit] = useState<{ nodeId: string; anchor: SideAnchor; range: Range } | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null)
  const latest = useRef({ contentOf })
  latest.current = { contentOf }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const evaluate = () => {
      const sel = getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setHit(null)
      const range = sel.getRangeAt(0)
      const rootOf = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest<HTMLElement>('[data-anchor-root]')
      const root = rootOf(range.startContainer)
      if (!root || root !== rootOf(range.endContainer) || !container.contains(root)) return setHit(null)
      const nodeId = root.dataset.anchorRoot!
      const content = latest.current.contentOf(nodeId)
      const span = content != null ? rangeToSource(root, range, content) : null
      if (!span || !content) return setHit(null)
      setHit({ nodeId, anchor: { ...span, text: content.slice(span.start, span.end) }, range: range.cloneRange() })
    }
    // Evaluate once the mouse/keyboard selection is finished; hide as soon as it collapses.
    const onUp = () => setTimeout(evaluate, 0)
    const onChange = () => {
      const sel = getSelection()
      if (!sel || sel.isCollapsed) setHit(null)
    }
    container.addEventListener('mouseup', onUp)
    container.addEventListener('keyup', onUp)
    document.addEventListener('selectionchange', onChange)
    return () => {
      container.removeEventListener('mouseup', onUp)
      container.removeEventListener('keyup', onUp)
      document.removeEventListener('selectionchange', onChange)
    }
  }, [containerRef])

  // Follow the selection while the chat scrolls.
  useEffect(() => {
    const container = containerRef.current
    if (!hit || !container) return setPos(null)
    const place = () => {
      const rects = hit.range.getClientRects()
      const first = rects[0] ?? hit.range.getBoundingClientRect()
      const box = container.getBoundingClientRect()
      const below = first.top - 44 < box.top
      const r = below ? (rects[rects.length - 1] ?? first) : first
      const visible = r.bottom > box.top && r.top < box.bottom
      setPos(visible ? { x: Math.min(Math.max(r.left + r.width / 2, box.left + 48), box.right - 48), y: below ? r.bottom + 8 : r.top - 8, below } : null)
    }
    place()
    container.addEventListener('scroll', place, { passive: true })
    window.addEventListener('resize', place)
    return () => {
      container.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
    }
  }, [hit, containerRef])

  if (!hit || !pos) return null
  return (
    <button
      // Keep the selection: a normal mousedown would clear it before the click lands.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onAsk(hit.nodeId, hit.anchor)
        getSelection()?.removeAllRanges()
        setHit(null)
      }}
      style={{ left: pos.x, top: pos.y }}
      className={
        'anim-pop fixed z-40 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-lg bg-text px-3 text-[13px] font-medium text-bg shadow-pop transition-opacity hover:opacity-90 ' +
        (pos.below ? '' : '-translate-y-full')
      }
    >
      <MessageSquareQuote size={14} />
      {t('side.ask')}
    </button>
  )
}

/** Menu at a click point for choosing among side questions whose highlights overlap there. */
export function ThreadPicker({
  at,
  items,
  onPick,
  onClose,
}: {
  at: { x: number; y: number }
  items: { thread: string; question: string }[]
  onPick: (thread: string) => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <MenuRoot open onOpenChange={(open) => !open && onClose()}>
      <MenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-px" style={{ left: at.x, top: at.y }} />
      </MenuTrigger>
      <MenuContent className="w-72">
        <MenuLabel>{t('side.pick')}</MenuLabel>
        {items.map((it) => (
          <MenuItem key={it.thread} icon={<MessageSquareText size={14} />} onSelect={() => onPick(it.thread)}>
            {it.question}
          </MenuItem>
        ))}
      </MenuContent>
    </MenuRoot>
  )
}

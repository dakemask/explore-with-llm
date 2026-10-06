import { MessageSquareText, MessageSquareQuote, NotebookPen } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Note, SideAnchor } from '../../db'
import { useT } from '../../i18n'
import { rangeToSource } from '../../lib/anchor'
import { MenuContent, MenuItem, MenuLabel, MenuRoot, MenuTrigger } from '../ui/Menu'

type Target = Note['target']

/**
 * Floating "Ask" / "Note" buttons over a text selection inside one main-line message (an element with
 * `data-anchor-root`: a reply, or a user message with `data-anchor-target="user"`, which only takes notes).
 * `contentOf` returns that message's source text.
 */
export function SelectionAsk({
  containerRef,
  contentOf,
  onAsk,
  onNote,
}: {
  containerRef: RefObject<HTMLElement | null>
  contentOf: (nodeId: string, target: Target) => string | undefined
  onAsk: (nodeId: string, anchor: SideAnchor) => void
  onNote: (nodeId: string, target: Target, anchor: SideAnchor) => void
}) {
  const t = useT()
  const [hit, setHit] = useState<{ nodeId: string; target: Target; anchor: SideAnchor; range: Range } | null>(null)
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
      const target: Target = root.dataset.anchorTarget === 'user' ? 'user' : 'assistant'
      const content = latest.current.contentOf(nodeId, target)
      const span = content != null ? rangeToSource(root, range, content) : null
      if (!span || !content) return setHit(null)
      setHit({ nodeId, target, anchor: { ...span, text: content.slice(span.start, span.end) }, range: range.cloneRange() })
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
  const action = (icon: ReactNode, label: string, run: () => void) => (
    <button
      // Keep the selection: a normal mousedown would clear it before the click lands.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        run()
        getSelection()?.removeAllRanges()
        setHit(null)
      }}
      className="flex h-8 items-center gap-1.5 px-3 transition-colors hover:bg-white/12 dark:hover:bg-black/8"
    >
      {icon}
      {label}
    </button>
  )
  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className={
        'anim-pop fixed z-40 flex -translate-x-1/2 items-center divide-x divide-border-strong/60 dark:divide-border overflow-hidden rounded-lg bg-text text-[13px] font-medium text-bg shadow-pop ' +
        (pos.below ? '' : '-translate-y-full')
      }
    >
      {hit.target === 'assistant' &&
        action(<MessageSquareQuote size={14} />, t('side.ask'), () => onAsk(hit.nodeId, hit.anchor))}
      {action(<NotebookPen size={14} />, t('note.add'), () => onNote(hit.nodeId, hit.target, hit.anchor))}
    </div>
  )
}

/** Menu at a click point for choosing among side questions and notes whose highlights overlap there. */
export function ThreadPicker({
  at,
  items,
  onPick,
  onClose,
}: {
  at: { x: number; y: number }
  items: { id: string; kind: 'side' | 'note'; title: string }[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  const t = useT()
  const kinds = new Set(items.map((it) => it.kind))
  return (
    <MenuRoot open onOpenChange={(open) => !open && onClose()}>
      <MenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-px" style={{ left: at.x, top: at.y }} />
      </MenuTrigger>
      <MenuContent className="w-72">
        <MenuLabel>{kinds.size > 1 ? t('pick.mixed') : kinds.has('note') ? t('note.pick') : t('side.pick')}</MenuLabel>
        {items.map((it) => (
          <MenuItem
            key={it.id}
            icon={
              it.kind === 'note' ? (
                <NotebookPen size={14} className="text-mark-note-strong" />
              ) : (
                <MessageSquareText size={14} />
              )
            }
            onSelect={() => onPick(it.id)}
          >
            {it.title}
          </MenuItem>
        ))}
      </MenuContent>
    </MenuRoot>
  )
}

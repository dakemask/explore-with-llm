import { autoUpdate, flip, hide, inline, offset, shift, useFloating } from '@floating-ui/react-dom'
import clsx from 'clsx'
import { MessageSquareText, MessageSquareQuote, NotebookPen } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Note, SideAnchor } from '../../db'
import { useT } from '../../i18n'
import { rangeToSource } from '../../lib/anchor'
import { Layer } from '../ui/Layer'
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
  /** `at` = the block the selection starts in (the passage the user is reading). */
  onAsk: (nodeId: string, anchor: SideAnchor, at: Element | null) => void
  onNote: (nodeId: string, target: Target, anchor: SideAnchor, at: Element | null) => void
}) {
  const t = useT()
  const [hit, setHit] = useState<{ nodeId: string; target: Target; anchor: SideAnchor; range: Range } | null>(null)
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

  // Placed by Floating UI around the selection (a virtual reference): above its first line, below its last
  // line when there's no room above in the chat (`inline` picks the line), kept inside the chat, following
  // it as the chat scrolls or resizes, hidden while it's scrolled out of view.
  const reference = useMemo(
    () =>
      hit && {
        getBoundingClientRect: () => hit.range.getBoundingClientRect(),
        getClientRects: () => hit.range.getClientRects(),
        contextElement: hit.range.startContainer.parentElement ?? undefined,
      },
    [hit],
  )
  const boundary = containerRef.current ?? undefined
  const { refs, floatingStyles, middlewareData, isPositioned } = useFloating({
    open: !!hit,
    strategy: 'fixed',
    placement: 'top',
    // top / left instead of a transform: the pop-in animation uses transform.
    transform: false,
    elements: { reference },
    middleware: [
      inline(),
      offset(8),
      flip({ boundary, padding: { top: 4 } }),
      shift({ boundary, padding: 8 }),
      hide({ boundary }),
    ],
    whileElementsMounted: autoUpdate,
  })

  if (!hit) return null
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
    <Layer
      ref={refs.setFloating}
      style={{ ...floatingStyles, visibility: middlewareData.hide?.referenceHidden ? 'hidden' : undefined }}
      // Escape / a press elsewhere puts it away (the selection stays until the press clears it).
      onDismiss={() => setHit(null)}
      onFocusOutside={(e) => e.preventDefault()}
      className={clsx(
        'z-40 flex items-center divide-x divide-border-strong/60 overflow-hidden rounded-lg bg-text text-[13px] font-medium text-bg shadow-pop dark:divide-border',
        isPositioned ? 'anim-pop' : 'invisible',
      )}
    >
      {hit.target === 'assistant' &&
        action(<MessageSquareQuote size={14} />, t('side.ask'), () => onAsk(hit.nodeId, hit.anchor, blockOf(hit.range)))}
      {action(<NotebookPen size={14} />, t('note.add'), () => onNote(hit.nodeId, hit.target, hit.anchor, blockOf(hit.range)))}
    </Layer>
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
                <NotebookPen size={14} />
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

/** The block (paragraph, list item, heading, cell…) where `range` starts. */
const blockOf = (range: Range) =>
  range.startContainer.parentElement?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre') ??
  range.startContainer.parentElement

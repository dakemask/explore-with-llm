import clsx from 'clsx'
import { GitBranch, KeyRound, PanelLeftOpen, PanelRightClose, PanelRightOpen, Sparkles, SquarePen } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useT } from '../../i18n'
import { quoteForInput } from '../../lib/anchor'
import { archiveThread, createConversation, lacksReply, selectPath, sendMessage, stopGeneration, threadToBranch } from '../../lib/chat'
import type { ImageFile } from '../../lib/images'
import { branchColors } from '../../lib/colors'
import { CHAT_MIN, columnFrame, sideWidth } from '../../lib/column'
import { PANE_DEFAULT, PANE_MAX, PANE_MIN } from '../../lib/panes'
import { focusComposer } from '../../lib/focus'
import { activePath, busyIds, isHidden } from '../../lib/tree'
import { jumpSelection, type MapUnit } from '../../lib/treeMap'
import { archiveNote, createNote, noteTitle } from '../../lib/notes'
import { glideTo, ScrollHold, useAutoScroll } from '../../lib/hooks'
import { useConversationData } from '../../lib/useConversationData'
import { useSettings } from '../../store/settings'
import { NEW_CHAT, useUi } from '../../store/ui'
import { SelectionAsk, ThreadPicker } from '../side/SelectionAsk'
import { NoteCard } from '../side/NoteCard'
import { SideCard } from '../side/SideCard'
import { CardMenu, NoteMenuItems, SideMenuItems } from '../side/CardMenu'
import { LEAVE_MS, SideColumn } from '../side/SideColumn'
import { NOTE_PREFIX, useNotes } from '../side/useNotes'
import { useSideQuestions } from '../side/useSideQuestions'
import { Button, IconButton } from '../ui/Button'
import { ResizeHandle } from '../ui/ResizeHandle'
import { Dots } from '../ui/Dots'
import { Composer } from './Composer'
import { DRAFT_PREFIX, MessageNode, Turn } from './MessageNode'
import { ModelControls, useCurrentModel } from './ModelPicker'
import { useSiblings } from './SiblingSwitcher'
import { TreeMapPanel } from './TreeMap'
import { useNodeActions } from './useNodeActions'

export function ChatView() {
  const t = useT()
  const conversationId = useUi((s) => s.conversationId)
  const setConversation = useUi((s) => s.setConversation)
  const openSettings = useUi((s) => s.openSettings)
  const panel = useUi((s) => s.panel)
  const setPanel = useUi((s) => s.setPanel)
  const startDraft = useUi((s) => s.startDraft)
  const setLeaving = useUi((s) => s.setLeaving)
  const leaving = useUi((s) => s.leaving)
  const { providers, provider, model, ready } = useCurrentModel()
  const naming = useUi((s) => !!conversationId && !!s.naming[conversationId])
  const listOpen = useSettings((s) => s.panes.list.open)
  const column = useSettings((s) => s.panes.column)
  const setPane = useSettings((s) => s.setPane)

  const data = useConversationData(conversationId)
  const conversation = data?.conversation
  const nodes = data?.nodes
  const loading = !data
  const path = useMemo(
    () => (nodes && conversation ? activePath(nodes, conversation.selectedChild) : []),
    [nodes, conversation],
  )
  const busy = useMemo(() => busyIds(nodes ?? []), [nodes])
  const colors = useMemo(() => branchColors(nodes ?? []), [nodes])
  const siblings = useSiblings(path, nodes, colors)
  const last = path[path.length - 1]
  const generating = last?.attempt.status === 'streaming'

  const canSend = ready

  // The node the detail dialog shows was archived (or sits under something archived): close it.
  useEffect(() => {
    if (nodes && panel && isHidden(nodes, panel.nodeId)) setPanel(null)
  }, [nodes, panel, setPanel])

  /** A new node always ends the active path, so keep the view pinned to the bottom. */
  const send = async (parentId: string | null, text: string, images: ImageFile[]) => {
    if (!provider || !model) return
    scroll.pin()
    let id = conversationId
    if (!id) {
      id = await createConversation()
      setConversation(id)
    }
    await sendMessage({ conversationId: id, parentId, text, images, provider, model })
  }

  const mainRef = useRef<HTMLElement>(null)
  const draftKey = conversationId ?? NEW_CHAT
  // Read once per box (it reads its starting text on mount); not a subscription.
  const composerDraft = useMemo(() => useUi.getState().composerDrafts[draftKey], [draftKey])
  const scroll = useAutoScroll(conversationId)
  // Opening a conversation (new, from the list, imported): ready to type.
  useEffect(() => focusComposer(), [conversationId])
  const actions = useNodeActions(nodes, scroll.hold)

  // ---- side questions and notes: highlights in the messages, cards in the column right of the chat ----
  const notes = useNotes(path, data?.notes)
  const side = useSideQuestions(path, nodes, conversation, notes)
  /**
   * 转为分支: the card, its bar and highlight fade out, then the thread turns into main nodes. The view stays
   * where it is: nothing above changes, and turns it adds below (asked from the last turn) aren't followed.
   */
  const convertThread = (thread: string) => {
    if (!conversationId) return
    const id = conversationId
    scroll.unpin()
    setLeaving(thread, true)
    // (Its card stays faded until it's gone from the data, see `useSideQuestions`; unless nothing was done.)
    setTimeout(() => void threadToBranch(id, thread).then((done) => done || setLeaving(thread, false)), LEAVE_MS + 60)
  }
  const [picker, setPicker] = useState<{
    x: number
    y: number
    items: { id: string; kind: 'side' | 'note'; title: string }[]
  } | null>(null)

  /** The side questions and notes whose highlight is under `target` (a draft's included), by item id. */
  const threadsAt = (target: EventTarget) => {
    const ids = (target as Element).closest?.<HTMLElement>('[data-threads]')?.dataset.threads?.split(' ') ?? []
    return ids.map((id) => id.replace(DRAFT_PREFIX, '').replace(NOTE_PREFIX, ''))
  }

  /** Clicking highlighted text expands (or collapses) its card, or offers a choice where several overlap. */
  const onContentClick = (e: MouseEvent) => {
    const sel = getSelection()
    if (sel && !sel.isCollapsed) return
    const ids = threadsAt(e.target)
    if (ids.length === 1) toggleCard(ids[0])
    else if (ids.length > 1) {
      const entry = (id: string) => {
        const it = side.items.find((it) => it.id === id)
        if (it?.kind === 'note') return { id, kind: 'note' as const, title: noteTitle(it.note.text) || t('note.new') }
        return { id, kind: 'side' as const, title: conversation?.threadTitles?.[id] ?? (it?.fallback || t('image.only')) }
      }
      setPicker({ x: e.clientX, y: e.clientY, items: ids.map(entry) })
    }
  }
  const contentOf = (nodeId: string, target: 'user' | 'assistant') => {
    const n = nodes?.find((n) => n.id === nodeId)
    return target === 'user' ? n?.user.text : n?.assistant.content
  }

  // Hover links: a highlight in the text lights up its card and bar; a card or bar deepens its highlight.
  const [hover, setHover] = useState<string[]>([])
  const hoverTo = (ids: string[]) => setHover((prev) => (prev.join(' ') === ids.join(' ') ? prev : ids))
  const hoverMarks = side.items.filter((it) => hover.includes(it.id))

  // The chat and the column share the scroll area's width (`lib/column.ts`). Re-laid out before the
  // browser paints (`flushSync`): otherwise a pane opening / closing or being dragged showed a frame of
  // the chat at its old place.
  const [area, setArea] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = scroll.containerRef.current
    if (!el) return
    const read = () => ({ width: el.clientWidth, height: el.clientHeight })
    setArea(read())
    const ro = new ResizeObserver(() => flushSync(() => setArea(read())))
    ro.observe(el)
    return () => ro.disconnect()
  }, [scroll.containerRef])
  const width = area.width
  // The input box floats over the bottom of the chat (the chat and the column reach the window's bottom); the
  // messages end above it: the room below them follows its height (same frame, like the widths above).
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  useLayoutEffect(() => {
    const el = composerRef.current
    if (!el) return
    const read = () => Math.round(el.getBoundingClientRect().height)
    setComposerHeight(read())
    const ro = new ResizeObserver(() => flushSync(() => setComposerHeight(read())))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // The column (collapsed: its marker strip) is always there, also with nothing in it (owner).
  const frame = columnFrame(width, sideWidth(width, column.open, column.width))
  const columnMax = Math.max(PANE_MIN.column, Math.min(PANE_MAX.column, width - CHAT_MIN))
  /** Opening / closing the column slides the chat and the column (CSS transitions, only meanwhile: not while
   * dragging or resizing the window). */
  const [slide, setSlide] = useState(false)
  const [openShown, setOpenShown] = useState(column.open)
  if (openShown !== column.open) {
    setOpenShown(column.open)
    setSlide(true)
  }
  useEffect(() => {
    if (!slide) return
    const timer = setTimeout(() => setSlide(false), 250)
    return () => clearTimeout(timer)
  }, [slide, column.open])
  const slideClass = slide && 'transition-[width,padding-left] duration-200 ease-out motion-reduce:transition-none'
  const setColumnOpen = (open: boolean) => {
    if (!open) side.expand(null)
    setPane('column', { open })
  }
  /** A highlight or bar was clicked: its card expands (opening the column if needed), or collapses if it's the expanded one. */
  const toggleCard = (id: string) => {
    if (side.expanded === id) return side.expand(null)
    setPane('column', { open: true })
    side.expand(id)
  }

  // ---- tree map: drops down under the header; `current` = the turn in view when it opened ----
  const treeButton = useRef<HTMLButtonElement>(null)
  const [tree, setTree] = useState<{ current?: string; closing?: boolean } | null>(null)
  const [scrollTarget, setScrollTarget] = useState<string | null>(null)
  const closeTree = () => setTree((s) => (s && !s.closing ? { ...s, closing: true } : s))
  useEffect(() => {
    if (!tree?.closing) return
    const timer = setTimeout(() => setTree(null), 120)
    return () => clearTimeout(timer)
  }, [tree])
  // Switching conversation (`setConversation`, which clears the store's part) resets the chat's transient
  // state here, during the render that shows the new conversation — so no frame still shows the old one's
  // tree map, overlap picker, hover links or pending jump.
  const [shownFor, setShownFor] = useState(conversationId)
  if (shownFor !== conversationId) {
    setShownFor(conversationId)
    setTree(null)
    setScrollTarget(null)
    setPicker(null)
    setHover([])
  }
  const toggleTree = () => {
    if (tree && !tree.closing) return closeTree()
    // The topmost turn still showing more than its footer.
    const box = scroll.containerRef.current
    const top = (box?.getBoundingClientRect().top ?? 0) + 48
    const turn = [...(box?.querySelectorAll<HTMLElement>('[data-turn]') ?? [])].find(
      (el) => el.getBoundingClientRect().bottom > top,
    )
    setTree({ current: turn?.dataset.turn ?? last?.id })
  }
  /** Shows the clicked turn: remember the selection at every fork above it, then scroll it to the top. */
  const jump = (unit: MapUnit) => {
    if (!conversation || !nodes) return
    const { target, selection } = jumpSelection(nodes, unit, conversation.selectedChild)
    closeTree()
    scroll.unpin()
    setScrollTarget(target.id)
    void selectPath(conversation.id, selection)
  }
  useEffect(() => {
    const box = scroll.containerRef.current
    const el = scrollTarget && box?.querySelector<HTMLElement>(`[data-turn="${CSS.escape(scrollTarget)}"]`)
    if (!box || !el) return // not on the path yet: the selection is still being saved
    const top =
      path[0]?.id === scrollTarget ? 0 : el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop + 1
    glideTo(box, top)
    setScrollTarget(null)
  }, [path, scrollTarget, scroll.containerRef])

  const noProvider = providers && !provider

  return (
    <main ref={mainRef} className="relative flex h-full min-w-0 flex-1 flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        {!listOpen && (
          <div className="anim-fade -mr-1 flex items-center gap-1">
            <IconButton label={t('pane.listOpen')} onClick={() => setPane('list', { open: true })}>
              <PanelLeftOpen size={17} />
            </IconButton>
            <IconButton label={t('sidebar.newChat')} onClick={() => setConversation(null)}>
              <SquarePen size={16} />
            </IconButton>
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center px-2 text-sm font-medium">
          {naming ? <Dots label={t('naming.pending')} /> : <span className="truncate">{conversation?.title}</span>}
        </div>
        <div className="flex items-center gap-1">
          {path.length > 0 && (
            <IconButton
              ref={treeButton}
              label={t('tree.title')}
              active={!!tree && !tree.closing}
              aria-expanded={!!tree && !tree.closing}
              onClick={toggleTree}
            >
              <GitBranch size={17} />
            </IconButton>
          )}
          <IconButton
            label={t(column.open ? 'pane.columnClose' : 'pane.columnOpen')}
            onClick={() => setColumnOpen(!column.open)}
          >
            {column.open ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </IconButton>
        </div>
      </header>

      {/* The open column's edge: a line from the header down (it slides with the column; fades when collapsed). */}
      <div
        aria-hidden
        className={clsx(
          'pointer-events-none absolute top-14 bottom-0 w-px bg-border transition-opacity duration-200',
          slide && 'transition-[left,opacity] ease-out motion-reduce:transition-none',
          !column.open && 'opacity-0',
        )}
        style={{ left: frame.sideLeft }}
      />
      {column.open && !slide && !tree && (
        <ResizeHandle
          label={t('pane.columnResize')}
          edge="right"
          width={frame.sideWidth}
          min={PANE_MIN.column}
          max={columnMax}
          onResize={(width) => setPane('column', { width })}
          onReset={() => setPane('column', { width: PANE_DEFAULT.column })}
          // Over the column's edge, the height of the scroll area (right below the header).
          className="top-14!"
          style={{ left: frame.sideLeft - 4, height: area.height }}
        />
      )}

      {tree && nodes && (
        <TreeMapPanel
          nodes={nodes}
          currentNodeId={tree.current}
          closing={!!tree.closing}
          ignore={treeButton}
          onClose={closeTree}
          onJump={jump}
        />
      )}

      {hoverMarks.length > 0 && (
        <style>
          {(['side', 'note'] as const)
            .map((kind) => {
              const marks = hoverMarks.filter((it) => it.kind === kind)
              if (!marks.length) return ''
              const sel = marks.map((it) => `.prose mark[data-threads~="${CSS.escape(it.mark)}"]`).join(',')
              return `${sel}{background: var(${kind === 'note' ? '--c-note-active' : '--c-anchor-active'})}`
            })
            .join('')}
        </style>
      )}

      <div
        ref={scroll.containerRef}
        onClick={onContentClick}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
      >
        {/* The blank space at the bottom goes on this wrapper (see useAutoScroll). */}
        <div ref={scroll.blankRef} className={clsx('flex items-start', slideClass)} style={{ paddingLeft: frame.chatLeft }}>
          <div
            ref={scroll.contentRef}
            onMouseOver={(e) => hoverTo(threadsAt(e.target))}
            onMouseLeave={() => hoverTo([])}
            className={clsx('shrink-0 px-6 py-8', slideClass)}
            style={{ width: frame.chatWidth }}
          >
            <ScrollHold.Provider value={scroll.hold}>
              {loading ? null : path.length === 0 ? (
                noProvider ? (
                  <EmptyState
                    icon={<KeyRound size={22} />}
                    title={t('chat.noProvider')}
                    hint={t('chat.noProviderHint')}
                    action={
                      <Button variant="primary" onClick={() => openSettings('providers')}>
                        {t('chat.addProvider')}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState icon={<Sparkles size={22} />} title={t('chat.emptyTitle')} />
                )
              ) : (
                <div>
                  {path.map((n, i) => (
                    <Turn key={n.id} id={n.id} first={i === 0}>
                      <MessageNode
                        node={n}
                        siblings={siblings.get(n.id)}
                        canSend={canSend}
                        actions={actions}
                        marks={side.anchors.get(n.id)}
                        busy={busy.has(n.id)}
                      />
                    </Turn>
                  ))}
                </div>
              )}
            </ScrollHold.Provider>
            {/* Room for the input box over the chat's bottom: an element, not padding, so the scroll rules
                (which observe this box's content size) see it grow as the box does. */}
            <div aria-hidden style={{ height: composerHeight }} />
          </div>
          {conversation && nodes && (
            <SideColumn
              items={path.length ? side.items : []}
              width={frame.sideWidth}
              content={scroll.contentRef}
              scroller={scroll.containerRef}
              collapsed={!column.open}
              slide={slide}
              expanded={side.expanded}
              leaving={leaving}
              hover={hover}
              onHover={hoverTo}
              onToggle={toggleCard}
              onEscape={side.onEscape}
              renderExpanded={(id, card) => {
                const it = side.items.find((it) => it.id === id)!
                if (it.kind === 'note') return <NoteCard key={id} note={it.note} onCollapse={() => side.expand(null)} />
                return (
                  <SideCard
                    key={id}
                    thread={id}
                    nodeId={it.nodeId}
                    path={it.path}
                    draft={it.draft}
                    conversation={conversation}
                    nodes={nodes}
                    fallback={it.fallback}
                    dropTarget={card}
                    onCollapse={() => side.expand(null)}
                    onConvert={() => convertThread(id)}
                  />
                )
              }}
              renderMenu={(id, className) => {
                const it = side.items.find((it) => it.id === id)!
                if (it.kind === 'note')
                  return (
                    <CardMenu className={className}>
                      <NoteMenuItems onArchive={() => void archiveNote(id)} />
                    </CardMenu>
                  )
                if (!it.path.length) return null
                return (
                  <CardMenu className={className}>
                    <SideMenuItems
                      conversation={conversation}
                      thread={id}
                      fallback={it.fallback}
                      nodes={nodes}
                      onConvert={() => convertThread(id)}
                      onArchive={() => void archiveThread(conversation.id, id)}
                    />
                  </CardMenu>
                )
              }}
            />
          )}
        </div>
      </div>

      <SelectionAsk
        containerRef={scroll.containerRef}
        contentOf={contentOf}
        // The user is reading the passage they asked about: keep it in place (a collapsed column opens and
        // may narrow the chat, rewrapping the text) and stop following the end.
        onAsk={(nodeId, anchor, at) => {
          if (at) scroll.hold(at)
          if (!conversationId) return
          setPane('column', { open: true })
          startDraft(nanoid(), { conversationId, nodeId, anchor, prefill: quoteForInput(anchor.text) })
        }}
        onNote={async (nodeId, target, anchor, at) => {
          if (at) scroll.hold(at)
          if (!conversationId) return
          setPane('column', { open: true })
          side.expand(await createNote(conversationId, nodeId, target, anchor))
        }}
      />
      {picker && (
        <ThreadPicker at={picker} items={picker.items} onPick={toggleCard} onClose={() => setPicker(null)} />
      )}

      {/* Over the chat's bottom (above the sticky reasoning toggle too), a little wider than the messages; the
          rest of this strip lets clicks through. Under its lower half and below it the background covers the
          messages, so they don't show under the box. */}
      <div
        ref={composerRef}
        data-main-composer
        className={clsx('pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-4', slideClass)}
        style={{ paddingLeft: frame.chatLeft }}
      >
        <div className={clsx('pointer-events-auto relative px-3', slideClass)} style={{ width: frame.chatWidth }}>
          <div aria-hidden className="absolute inset-x-0 -bottom-4 h-14 bg-bg" />
          <Composer
            // Each conversation keeps its own unsent text: a new box per conversation, starting from its draft.
            key={draftKey}
            initialText={composerDraft?.text}
            initialImages={composerDraft?.images}
            onLeave={(text, images) => useUi.getState().saveComposerDraft(draftKey, text, images)}
            onSend={(text, images) => send(last?.id ?? null, text, images)}
            dropTarget={mainRef}
            onStop={() => last && stopGeneration(last.id)}
            generating={generating}
            disabled={!canSend}
            leading={<ModelControls />}
            regenerate={lacksReply(last) ? { onClick: canSend ? () => actions.retry(last) : undefined } : undefined}
          />
        </div>
      </div>
    </main>
  )
}

function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="anim-fade flex flex-col items-center pt-[18vh] text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

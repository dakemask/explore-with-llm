import { GitBranch, KeyRound, Sparkles } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { quoteForInput } from '../../lib/anchor'
import { createConversation, lacksReply, selectPath, sendMessage, stopGeneration } from '../../lib/chat'
import type { ImageFile } from '../../lib/images'
import { branchColors, parentColor } from '../../lib/colors'
import { columnFrame } from '../../lib/column'
import { activePath, busyIds, isHidden } from '../../lib/tree'
import { jumpSelection, type MapUnit } from '../../lib/treeMap'
import { createNote, noteTitle } from '../../lib/notes'
import { glideTo, ScrollHold, useAutoScroll } from '../../lib/hooks'
import { useConversationData } from '../../lib/useConversationData'
import { useUi } from '../../store/ui'
import { SelectionAsk, ThreadPicker } from '../side/SelectionAsk'
import { NoteCard } from '../side/NoteCard'
import { SideCard } from '../side/SideCard'
import { SideColumn } from '../side/SideColumn'
import { NOTE_PREFIX, useNotes } from '../side/useNotes'
import { useSideQuestions } from '../side/useSideQuestions'
import { Button, IconButton } from '../ui/Button'
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
  const { providers, provider, model, ready } = useCurrentModel()
  const naming = useUi((s) => !!conversationId && !!s.naming[conversationId])

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
  const scroll = useAutoScroll(conversationId)
  const actions = useNodeActions(nodes, scroll.hold)

  // ---- side questions and notes: highlights in the messages, cards in the column right of the chat ----
  const notes = useNotes(path, data?.notes)
  const side = useSideQuestions(path, nodes, conversation, notes)
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

  /** Clicking highlighted text expands its card, or offers a choice where several overlap. */
  const onContentClick = (e: MouseEvent) => {
    const sel = getSelection()
    if (sel && !sel.isCollapsed) return
    const ids = threadsAt(e.target)
    if (ids.length === 1) side.expand(ids[0])
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

  // The chat and the column share the scroll area's width (`lib/column.ts`).
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = scroll.containerRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scroll.containerRef])
  const showColumn = path.length > 0 && side.items.length > 0
  const frame = columnFrame(width, showColumn)

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
  useEffect(() => setTree(null), [conversationId])
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
        <div className="flex min-w-0 flex-1 items-center px-2 text-sm font-medium">
          {naming ? <Dots label={t('naming.pending')} /> : <span className="truncate">{conversation?.title}</span>}
        </div>
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
      </header>

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
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        {/* The blank space at the bottom goes on this wrapper (see useAutoScroll). */}
        <div ref={scroll.blankRef} className="flex items-start" style={{ paddingLeft: frame.chatLeft }}>
          <div
            ref={scroll.contentRef}
            onMouseOver={(e) => hoverTo(threadsAt(e.target))}
            onMouseLeave={() => hoverTo([])}
            className="shrink-0 px-6 py-8"
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
                    <Turn key={n.id} id={n.id} first={i === 0} color={colors.get(n.id)} from={parentColor(colors, n)}>
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
          </div>
          {showColumn && conversation && nodes && (
            <SideColumn
              items={side.items}
              width={frame.sideWidth}
              content={scroll.contentRef}
              scroller={scroll.containerRef}
              expanded={side.expanded}
              hover={hover}
              onHover={hoverTo}
              onExpand={side.expand}
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
                  />
                )
              }}
            />
          )}
        </div>
      </div>

      <SelectionAsk
        containerRef={scroll.containerRef}
        contentOf={contentOf}
        onAsk={(nodeId, anchor) => {
          if (conversationId)
            startDraft(nanoid(), { conversationId, nodeId, anchor, prefill: quoteForInput(anchor.text) })
        }}
        onNote={async (nodeId, target, anchor) => {
          if (conversationId) side.expand(await createNote(conversationId, nodeId, target, anchor))
        }}
      />
      {picker && (
        <ThreadPicker at={picker} items={picker.items} onPick={side.expand} onClose={() => setPicker(null)} />
      )}

      <div className="shrink-0 pb-5" style={{ paddingLeft: frame.chatLeft }}>
        <div className="px-6" style={{ width: frame.chatWidth }}>
          <Composer
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

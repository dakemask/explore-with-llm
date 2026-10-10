import { MessageSquareText } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { ChatNode, Conversation } from '../../db'
import { useT } from '../../i18n'
import { sideFallbackTitle } from '../../lib/naming'
import { sideThreads, threadPath, threadRoots } from '../../lib/tree'
import { isEmptyDraft, useUi, type SideDraft } from '../../store/ui'
import { DRAFT_PREFIX, type NodeMarks } from '../chat/MessageNode'
import type { ColumnItem } from './SideColumn'
import { ThreadTitle } from './SideCard'
import type { NoteItem } from './useNotes'

/** A side question on the active path (or a draft asked from it), as the column shows it. */
export interface SideItem extends ColumnItem {
  kind: 'side'
  /** The main node it was asked from. */
  nodeId: string
  /** The thread as shown (empty for a draft). */
  path: ChatNode[]
  draft?: SideDraft
  /** Title until the naming model gives one. */
  fallback: string
}

/** What the column holds: side questions and notes. */
export type AnyItem = SideItem | NoteItem

/**
 * The column's items for the active path — its side questions, plus `notes` (`useNotes`) — the
 * highlights for each message, and the rules around them: a sent draft becomes its thread, a card whose
 * item leaves the path (archived, another branch shown) collapses, Escape collapses (`onEscape`, unless
 * focus is in the tree map window or in an input other than the card's own box with nothing typed; menus / dialogs above it take
 * Escape first by layering).
 */
export function useSideQuestions(
  path: ChatNode[],
  nodes: ChatNode[] | undefined,
  conversation: Conversation | undefined,
  notes: NoteItem[],
) {
  const t = useT()
  const expanded = useUi((s) => s.expanded)
  const drafts = useUi((s) => s.drafts)
  const expand = useUi((s) => s.expand)
  const dropDraft = useUi((s) => s.dropDraft)

  const sideItems = useMemo(() => {
    if (!nodes || !conversation) return []
    const out: SideItem[] = []
    const item = (it: Omit<SideItem, 'kind' | 'title' | 'tip'>, meta: string): SideItem => {
      const title = conversation.threadTitles?.[it.id] ?? (it.fallback || t('image.only'))
      return {
        ...it,
        kind: 'side',
        title: (
          <span className="flex min-w-0 items-center gap-2">
            <MessageSquareText size={13} className="shrink-0 text-node" />
            <ThreadTitle thread={it.id} conversation={conversation} fallback={it.fallback} />
            {/* (Only drafts say what they are: one looks like a sent question otherwise.) */}
            {it.draft && <span className="shrink-0 text-[11px] text-faint">{t('side.draft')}</span>}
          </span>
        ),
        tip: `${title} · ${meta}`,
      }
    }
    for (const n of path) {
      for (const { thread, anchor } of sideThreads(nodes, n.id)) {
        const p = threadPath(nodes, thread, conversation.selectedChild)
        const turns = p.length === 1 ? t('side.turns1') : t('side.turns', { n: p.length })
        out.push(item({ id: thread, mark: thread, nodeId: n.id, path: p, fallback: sideFallbackTitle(p[0], anchor.text) }, turns))
      }
    }
    const onPath = new Set(path.map((n) => n.id))
    for (const [thread, d] of Object.entries(drafts)) {
      if (d.conversationId !== conversation.id || !onPath.has(d.nodeId) || threadRoots(nodes, thread).length) continue
      const fallback = sideFallbackTitle({ user: { text: d.text } }, d.anchor.text)
      out.push(item({ id: thread, mark: DRAFT_PREFIX + thread, nodeId: d.nodeId, path: [], draft: d, fallback }, t('side.draft')))
    }
    return out
  }, [path, nodes, conversation, drafts, t])
  const items = useMemo((): AnyItem[] => [...sideItems, ...notes], [sideItems, notes])

  // The first message of a draft was sent: it's a thread now.
  useEffect(() => {
    if (!nodes) return
    for (const thread of Object.keys(drafts)) if (threadRoots(nodes, thread).length) dropDraft(thread)
  }, [nodes, drafts, dropDraft])

  // A thread turned into a branch has left the data: done fading.
  const leaving = useUi((s) => s.leaving)
  const setLeaving = useUi((s) => s.setLeaving)
  useEffect(() => {
    if (!nodes) return
    for (const thread of Object.keys(leaving)) if (!threadRoots(nodes, thread).length) setLeaving(thread, false)
  }, [nodes, leaving, setLeaving])

  // The expanded card's item left the path: collapse it (an empty draft goes, its card already closed).
  // Only once it was there: a new note's card expands before the note shows up in the list.
  const loaded = !!nodes && !!conversation
  const seen = useRef(new Set<string>())
  useEffect(() => {
    if (!expanded) return void seen.current.clear()
    if (!loaded) return
    if (items.some((it) => it.id === expanded)) return void seen.current.add(expanded)
    if (!seen.current.has(expanded) && !useUi.getState().drafts[expanded]) return
    seen.current.delete(expanded)
    expand(null)
    const d = useUi.getState().drafts[expanded]
    if (d && isEmptyDraft(d)) dropDraft(expanded)
  }, [loaded, expanded, items, expand, dropDraft])

  /** The expanded card's Escape (its `Layer` gets it only while nothing above it is open). */
  const onEscape = (e: KeyboardEvent) => {
    if (e.isComposing) return
    const focus = document.activeElement
    // Focus in the tree map window: that Escape is the window's.
    if (focus?.closest('[data-tree-map]')) return
    const busy = 'input, textarea, select, [contenteditable="true"]'
    // A card's own input box with nothing typed in it doesn't hold Escape back.
    if (focus?.closest(busy) && !focus.matches('[data-side-column] textarea[data-pristine]')) return
    e.preventDefault()
    expand(null)
    // A card button keeps focus after a click; collapsing by key would light up its focus ring.
    if (focus instanceof HTMLElement && focus.closest('[data-side-column]')) focus.blur()
  }

  const anchors = useAnchors(path, items, expanded, leaving)
  return { items, anchors, expanded, expand, onEscape }
}

/**
 * Highlights for each node on the path: side questions and notes on its reply or on its message (an empty
 * list still enables selecting text). Reused while unchanged so memoized messages don't re-render
 * their Markdown.
 */
function useAnchors(path: ChatNode[], items: AnyItem[], expanded: string | null, leaving: Record<string, true>) {
  const cache = useRef(new Map<string, NodeMarks>())
  return useMemo(() => {
    const next = new Map<string, NodeMarks>()
    for (const n of path) {
      const marks: NodeMarks = { reply: [], user: [] }
      for (const it of items) {
        if (it.nodeId !== n.id) continue
        const active = it.id === expanded
        if (it.kind === 'note') {
          const { start, end } = it.note.anchor
          marks[it.note.target === 'user' ? 'user' : 'reply'].push({ id: it.mark, start, end, active, note: true })
        } else {
          const anchor = it.draft?.anchor ?? it.path[0].anchor!
          marks[anchor.target === 'user' ? 'user' : 'reply'].push({ id: it.mark, start: anchor.start, end: anchor.end, active, leaving: leaving[it.id] })
        }
      }
      const prev = cache.current.get(n.id)
      next.set(n.id, prev && JSON.stringify(prev) === JSON.stringify(marks) ? prev : marks)
    }
    cache.current = next
    return next
  }, [path, items, expanded, leaving])
}

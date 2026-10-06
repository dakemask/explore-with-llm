import { useEffect, useMemo, useRef } from 'react'
import type { ChatNode, Conversation } from '../../db'
import { useT } from '../../i18n'
import type { AnchorMark } from '../../lib/anchor'
import { sideFallbackTitle } from '../../lib/naming'
import { sideThreads, threadPath, threadRoots } from '../../lib/tree'
import { isEmptyDraft, useUi, type SideDraft } from '../../store/ui'
import { DRAFT_PREFIX } from '../chat/MessageNode'
import type { ColumnItem } from './SideColumn'
import { ThreadTitle } from './SideCard'

/** A side question on the active path (or a draft asked from it), as the column shows it. */
export interface SideItem extends ColumnItem {
  /** The main node it was asked from. */
  nodeId: string
  /** The thread as shown (empty for a draft). */
  path: ChatNode[]
  draft?: SideDraft
  /** Title until the naming model gives one. */
  fallback: string
}

/**
 * The side questions of the active path for the column: its items, the highlights for each reply, and
 * the rules around them — a sent draft becomes its thread, a card whose thread leaves the path (archived,
 * another branch shown) collapses, Escape collapses (unless focus is in an input, menu or dialog).
 */
export function useSideQuestions(path: ChatNode[], nodes: ChatNode[] | undefined, conversation: Conversation | undefined) {
  const t = useT()
  const expanded = useUi((s) => s.expanded)
  const drafts = useUi((s) => s.drafts)
  const expand = useUi((s) => s.expand)
  const dropDraft = useUi((s) => s.dropDraft)

  const items = useMemo(() => {
    if (!nodes || !conversation) return []
    const out: SideItem[] = []
    const item = (it: Omit<SideItem, 'kind' | 'title' | 'tip' | 'meta'>, meta: string): SideItem => {
      const title = conversation.threadTitles?.[it.id] ?? (it.fallback || t('image.only'))
      return {
        ...it,
        kind: 'side',
        meta,
        title: <ThreadTitle thread={it.id} conversation={conversation} fallback={it.fallback} />,
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

  // The first message of a draft was sent: it's a thread now.
  useEffect(() => {
    if (!nodes) return
    for (const thread of Object.keys(drafts)) if (threadRoots(nodes, thread).length) dropDraft(thread)
  }, [nodes, drafts, dropDraft])

  // The expanded card's thread left the path: collapse it (an empty draft goes, its card already closed).
  const loaded = !!nodes && !!conversation
  useEffect(() => {
    if (!loaded || !expanded || items.some((it) => it.id === expanded)) return
    expand(null)
    const d = useUi.getState().drafts[expanded]
    if (d && isEmptyDraft(d)) dropDraft(expanded)
  }, [loaded, expanded, items, expand, dropDraft])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      // (While the detail panel covers the column the card isn't seen, so it stays.)
      if (e.key !== 'Escape' || e.defaultPrevented || useUi.getState().panel) return
      const focus = document.activeElement
      const busy = 'input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"], [role="listbox"]'
      if (focus?.closest(busy) || document.querySelector('[role="menu"], [role="dialog"]')) return
      expand(null)
    }
    // Capture: runs before an open menu's own Escape handling moves focus away from it.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [expanded, expand])

  const anchors = useAnchors(path, items, expanded)
  return { items, anchors, expanded, expand }
}

/**
 * Side-question highlights for each node on the path (an empty list still enables selecting text).
 * Lists are reused while unchanged so memoized messages don't re-render their Markdown.
 */
function useAnchors(path: ChatNode[], items: SideItem[], expanded: string | null) {
  const cache = useRef(new Map<string, AnchorMark[]>())
  return useMemo(() => {
    const next = new Map<string, AnchorMark[]>()
    for (const n of path) {
      const list: AnchorMark[] = items
        .filter((it) => it.nodeId === n.id)
        .map((it) => {
          const anchor = it.draft?.anchor ?? it.path[0].anchor!
          return { id: it.mark, start: anchor.start, end: anchor.end, active: it.id === expanded }
        })
      const prev = cache.current.get(n.id)
      next.set(n.id, prev && JSON.stringify(prev) === JSON.stringify(list) ? prev : list)
    }
    cache.current = next
    return next
  }, [path, items, expanded])
}

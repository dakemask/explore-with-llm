import { useLiveQuery } from 'dexie-react-hooks'
import { KeyRound, Sparkles } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { db, type ChatNode } from '../../db'
import { useT } from '../../i18n'
import type { AnchorMark } from '../../lib/anchor'
import { createConversation, sendMessage, stopGeneration } from '../../lib/chat'
import type { ImageFile } from '../../lib/images'
import { activePath, sideThreads, siblingsOf, threadPath } from '../../lib/tree'
import { useAutoScroll } from '../../lib/hooks'
import { useUi, type Panel } from '../../store/ui'
import { SelectionAsk, ThreadPicker } from '../side/SelectionAsk'
import { Button } from '../ui/Button'
import { Dots } from '../ui/Dots'
import { sideFallbackTitle } from '../../lib/naming'
import { Composer } from './Composer'
import { DRAFT_PREFIX, MessageNode } from './MessageNode'
import { ModelControls, useCurrentModel } from './ModelPicker'
import { useNodeActions } from './useNodeActions'

export function ChatView() {
  const t = useT()
  const conversationId = useUi((s) => s.conversationId)
  const setConversation = useUi((s) => s.setConversation)
  const openSettings = useUi((s) => s.openSettings)
  const panel = useUi((s) => s.panel)
  const setPanel = useUi((s) => s.setPanel)
  const { providers, provider, model, ready } = useCurrentModel()
  const naming = useUi((s) => !!conversationId && !!s.naming[conversationId])

  const conversation = useLiveQuery(
    () => (conversationId ? db.conversations.get(conversationId) : undefined),
    [conversationId],
  )
  const nodes = useLiveQuery(
    () => (conversationId ? db.nodes.where('conversationId').equals(conversationId).toArray() : []),
    [conversationId],
  )
  const path = useMemo(
    () => (nodes && conversation ? activePath(nodes, conversation.selectedChild) : []),
    [nodes, conversation],
  )
  const last = path[path.length - 1]
  const generating = last?.attempt.status === 'streaming'

  const canSend = ready

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
  const actions = useNodeActions(nodes, scroll.pin)
  const anchors = useAnchors(path, nodes, panel)
  const [picker, setPicker] = useState<{
    x: number
    y: number
    nodeId: string
    items: { thread: string; question: string }[]
  } | null>(null)

  const openThread = (nodeId: string, thread: string) => setPanel({ type: 'side', nodeId, thread })

  /** Clicking highlighted text opens its side question, or offers a choice where several overlap. */
  const onContentClick = (e: MouseEvent) => {
    const sel = getSelection()
    if (sel && !sel.isCollapsed) return
    const mark = (e.target as Element).closest<HTMLElement>('[data-threads]')
    const root = mark?.closest<HTMLElement>('[data-anchor-root]')
    if (!mark || !root) return
    const nodeId = root.dataset.anchorRoot!
    const threads = mark.dataset.threads!.split(' ').filter((id) => !id.startsWith(DRAFT_PREFIX))
    if (threads.length === 1) openThread(nodeId, threads[0])
    else if (threads.length > 1) {
      const all = nodes ?? []
      setPicker({
        x: e.clientX,
        y: e.clientY,
        nodeId,
        items: threads.map((thread) => ({
          thread,
          question: (() => {
            const root = threadPath(all, thread, conversation?.selectedChild ?? {})[0]
            return conversation?.threadTitles?.[thread] ?? (sideFallbackTitle(root, root?.anchor?.text ?? '') || t('image.only'))
          })(),
        })),
      })
    }
  }
  const contentOf = (nodeId: string) => nodes?.find((n) => n.id === nodeId)?.assistant.content

  const noProvider = providers && !provider

  return (
    <main ref={mainRef} className="flex h-full min-w-0 flex-1 flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex min-w-0 flex-1 items-center px-2 text-sm font-medium">
          {naming ? <Dots label={t('naming.pending')} /> : <span className="truncate">{conversation?.title}</span>}
        </div>
      </header>

      <div ref={scroll.containerRef} onClick={onContentClick} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={scroll.contentRef} className="mx-auto w-full max-w-3xl px-6 py-8">
          {path.length === 0 ? (
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
            <div className="space-y-10">
              {path.map((n) => {
                const sibs = siblingsOf(nodes ?? [], n)
                return (
                  <MessageNode
                    key={n.id}
                    node={n}
                    branchIndex={sibs.indexOf(n)}
                    branchCount={sibs.length}
                    canSend={canSend}
                    actions={actions}
                    anchors={anchors.get(n.id)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      <SelectionAsk
        containerRef={scroll.containerRef}
        contentOf={contentOf}
        onAsk={(nodeId, anchor) =>
          setPanel({ type: 'side', nodeId, thread: nanoid(), draft: anchor })
        }
      />
      {picker && (
        <ThreadPicker
          at={picker}
          items={picker.items}
          onPick={(thread) => openThread(picker.nodeId, thread)}
          onClose={() => setPicker(null)}
        />
      )}

      <div className="shrink-0 px-6 pb-5">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            onSend={(text, images) => send(last?.id ?? null, text, images)}
            dropTarget={mainRef}
            onStop={() => last && stopGeneration(last.id)}
            generating={generating}
            disabled={!canSend}
            leading={<ModelControls />}
          />
        </div>
      </div>
    </main>
  )
}

/**
 * Side-question highlights for each node on the path (an empty list still enables selecting text).
 * Lists are reused while unchanged so memoized messages don't re-render their Markdown.
 */
function useAnchors(path: ChatNode[], nodes: ChatNode[] | undefined, panel: Panel | null) {
  const cache = useRef(new Map<string, AnchorMark[]>())
  return useMemo(() => {
    const side = panel?.type === 'side' ? panel : panel?.type === 'detail' ? panel.back : undefined
    const next = new Map<string, AnchorMark[]>()
    for (const n of path) {
      const list: AnchorMark[] = sideThreads(nodes ?? [], n.id).map((t) => ({
        id: t.thread,
        start: t.anchor.start,
        end: t.anchor.end,
        active: side?.thread === t.thread,
      }))
      if (side?.draft && side.nodeId === n.id) {
        list.push({ id: DRAFT_PREFIX + side.thread, start: side.draft.start, end: side.draft.end, active: true })
      }
      const prev = cache.current.get(n.id)
      next.set(n.id, prev && JSON.stringify(prev) === JSON.stringify(list) ? prev : list)
    }
    cache.current = next
    return next
  }, [path, nodes, panel])
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

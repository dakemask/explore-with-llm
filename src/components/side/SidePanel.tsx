import { useLiveQuery } from 'dexie-react-hooks'
import { Locate, MessagesSquare, Trash2, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { db } from '../../db'
import { useT } from '../../i18n'
import { plainQuote } from '../../lib/anchor'
import { deleteThread, sendMessage, stopGeneration } from '../../lib/chat'
import { useAutoScroll } from '../../lib/hooks'
import { siblingsOf, threadPath } from '../../lib/tree'
import { useUi, type SidePanel as SidePanelState } from '../../store/ui'
import { Composer } from '../chat/Composer'
import { DRAFT_PREFIX, MessageNode } from '../chat/MessageNode'
import { ModelPicker, useCurrentModel } from '../chat/ModelPicker'
import { useNodeActions } from '../chat/useNodeActions'
import { IconButton } from '../ui/Button'
import { confirmDialog } from '../ui/Dialog'

/** Right-hand panel for one side-question thread: the quoted text, its messages, and a composer. */
export function SidePanel({ panel }: { panel: SidePanelState }) {
  const t = useT()
  const setPanel = useUi((s) => s.setPanel)
  const conversationId = useUi((s) => s.conversationId)
  const { provider, model } = useCurrentModel()
  const conversation = useLiveQuery(
    async () => (conversationId ? ((await db.conversations.get(conversationId)) ?? null) : null),
    [conversationId],
  )
  const nodes = useLiveQuery(
    () => (conversationId ? db.nodes.where('conversationId').equals(conversationId).toArray() : []),
    [conversationId],
  )
  const path = useMemo(
    () => (nodes && conversation ? threadPath(nodes, panel.thread, conversation.selectedChild) : []),
    [nodes, conversation, panel.thread],
  )
  const root = path[0]
  const last = path[path.length - 1]
  const anchor = root?.anchor ?? panel.draft
  const loaded = nodes !== undefined && conversation !== undefined

  useEffect(() => {
    if (!loaded) return
    // Thread deleted elsewhere → close; first message sent → no longer a draft.
    if (!root && !panel.draft) setPanel(null)
    else if (root && panel.draft) setPanel({ type: 'side', nodeId: panel.nodeId, thread: panel.thread })
  }, [loaded, root, panel, setPanel])

  const scroll = useAutoScroll(panel.thread)
  const actions = useNodeActions(nodes, scroll.pin)
  const canSend = !!provider && !!model

  const send = (text: string) => {
    if (!provider || !model || !conversationId) return
    scroll.pin()
    void sendMessage({
      conversationId,
      parentId: last?.id ?? panel.nodeId,
      text,
      provider,
      model,
      side: last ? { thread: panel.thread } : { thread: panel.thread, anchor: panel.draft },
    })
  }

  const remove = async () => {
    if (!conversationId || !(await confirmDialog(t('side.deleteConfirm'), { danger: true }))) return
    setPanel(null)
    await deleteThread(conversationId, panel.thread)
  }

  const locate = () => {
    const ids = [panel.thread, DRAFT_PREFIX + panel.thread]
    const el = document.querySelector(
      ids.map((id) => `[data-anchor-root="${panel.nodeId}"] [data-threads~="${id}"]`).join(','),
    )
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <aside className="anim-drawer flex h-full w-[460px] shrink-0 flex-col border-l border-border bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border pr-3 pl-5">
        <MessagesSquare size={16} className="text-muted" />
        <h2 className="flex-1 text-[15px] font-semibold">{t('side.title')}</h2>
        {root && (
          <IconButton label={t('side.delete')} size="sm" onClick={remove}>
            <Trash2 size={15} />
          </IconButton>
        )}
        <IconButton label={t('common.close')} size="sm" onClick={() => setPanel(null)}>
          <X size={16} />
        </IconButton>
      </header>

      <div ref={scroll.containerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={scroll.contentRef} className="px-5 pt-4 pb-8">
          {anchor && (
            <div className="group/quote rounded-lg bg-anchor px-3.5 py-2.5 shadow-[inset_3px_0_0_var(--c-anchor-line)]">
              <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted">
                {t('side.quote')}
                <button
                  onClick={locate}
                  className="flex items-center gap-1 rounded px-1 opacity-0 transition-opacity group-hover/quote:opacity-100 hover:text-text focus-visible:opacity-100"
                >
                  <Locate size={12} />
                  {t('side.locate')}
                </button>
              </div>
              <div className="line-clamp-6 text-[13px] leading-relaxed whitespace-pre-wrap">{plainQuote(anchor.text)}</div>
            </div>
          )}
          {path.length === 0 ? (
            <p className="mt-6 px-2 text-center text-[13px] text-faint">{t('side.draftHint')}</p>
          ) : (
            <div className="mt-6 space-y-8">
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
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4">
        <Composer
          key={panel.thread}
          onSend={send}
          onStop={() => last && stopGeneration(last.id)}
          generating={last?.attempt.status === 'streaming'}
          disabled={!canSend}
          placeholder={t('side.placeholder')}
          leading={<ModelPicker />}
        />
      </div>
    </aside>
  )
}

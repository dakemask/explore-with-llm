import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { db } from '../../db'
import { useT } from '../../i18n'
import { quoteForInput } from '../../lib/anchor'
import { archiveThread, sendMessage, stopGeneration } from '../../lib/chat'
import { sideFallbackTitle } from '../../lib/naming'
import type { ImageFile } from '../../lib/images'
import { useAutoScroll } from '../../lib/hooks'
import { busyIds, siblingsOf, threadPath, threadRoots } from '../../lib/tree'
import { useUi, type SidePanel as SidePanelState } from '../../store/ui'
import { Composer } from '../chat/Composer'
import { MessageNode } from '../chat/MessageNode'
import { ModelControls, useCurrentModel } from '../chat/ModelPicker'
import { useNodeActions } from '../chat/useNodeActions'
import { IconButton } from '../ui/Button'
import { Dots } from '../ui/Dots'

/** Right-hand panel for one side-question thread: the quoted text, its messages, and a composer. */
export function SidePanel({ panel }: { panel: SidePanelState }) {
  const t = useT()
  const setPanel = useUi((s) => s.setPanel)
  const conversationId = useUi((s) => s.conversationId)
  const { provider, model, ready } = useCurrentModel()
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
  const loaded = nodes !== undefined && conversation !== undefined
  const naming = useUi((s) => !!s.naming[panel.thread])
  const title = conversation?.threadTitles?.[panel.thread] ?? sideFallbackTitle(root, root?.anchor?.text ?? panel.draft?.text ?? '')

  useEffect(() => {
    if (!loaded) return
    // Thread deleted elsewhere → close; first message sent → no longer a draft.
    if (!root && !panel.draft) setPanel(null)
    else if (root && panel.draft) setPanel({ type: 'side', nodeId: panel.nodeId, thread: panel.thread })
  }, [loaded, root, panel, setPanel])

  const scroll = useAutoScroll(panel.thread)
  const actions = useNodeActions(nodes, scroll.pin)
  const canSend = ready

  const asideRef = useRef<HTMLElement>(null)
  const send = (text: string, images: ImageFile[]) => {
    if (!provider || !model || !conversationId) return
    scroll.pin()
    void sendMessage({
      conversationId,
      parentId: last?.id ?? panel.nodeId,
      text,
      images,
      provider,
      model,
      side: last ? { thread: panel.thread } : { thread: panel.thread, anchor: panel.draft },
    })
  }

  // Reversible (restored from the archive dialog), so no confirmation.
  const busy = useMemo(() => {
    const ids = busyIds(nodes ?? [])
    return threadRoots(nodes ?? [], panel.thread).some((r) => ids.has(r.id))
  }, [nodes, panel.thread])
  const archive = async () => {
    if (!conversationId || busy) return
    setPanel(null)
    await archiveThread(conversationId, panel.thread)
  }

  return (
    <aside ref={asideRef} className="anim-drawer flex h-full w-[460px] shrink-0 flex-col border-l border-border bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border pr-3 pl-5">
        <div className="min-w-0 flex-1">
          <h2 className="flex h-5 items-center text-[14px] font-semibold">
            {naming ? <Dots label={t('naming.pending')} /> : <span className="truncate">{title}</span>}
          </h2>
          <div className="text-[11px] leading-4 text-faint">{t('side.title')}</div>
        </div>
        {root && (
          <IconButton
            label={busy ? t('archive.busy') : t('side.archive')}
            size="sm"
            aria-disabled={busy}
            className={busy ? 'cursor-default opacity-40 hover:bg-transparent hover:text-muted' : undefined}
            onClick={archive}
          >
            <Archive size={15} />
          </IconButton>
        )}
        <IconButton label={t('common.close')} size="sm" onClick={() => setPanel(null)}>
          <X size={16} />
        </IconButton>
      </header>

      <div ref={scroll.containerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={scroll.contentRef} className="px-5 pt-4 pb-8">
          {path.length === 0 ? (
            <p className="mt-2 px-4 text-center text-[13px] leading-relaxed text-faint">{t('side.draftHint')}</p>
          ) : (
            <div className="space-y-8">
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
          initialText={panel.draft && !root ? quoteForInput(panel.draft.text) : ''}
          leading={<ModelControls />}
          dropTarget={asideRef}
        />
      </div>
    </aside>
  )
}

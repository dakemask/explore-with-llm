import { useLiveQuery } from 'dexie-react-hooks'
import { KeyRound, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { db } from '../../db'
import { useT } from '../../i18n'
import { createConversation, selectBranch, sendMessage, stopGeneration } from '../../lib/chat'
import { activePath, siblingsOf } from '../../lib/tree'
import { useUi } from '../../store/ui'
import { Button } from '../ui/Button'
import { Composer } from './Composer'
import { MessageNode, type NodeActions } from './MessageNode'
import { ModelPicker, useCurrentModel } from './ModelPicker'

export function ChatView() {
  const t = useT()
  const conversationId = useUi((s) => s.conversationId)
  const setConversation = useUi((s) => s.setConversation)
  const openSettings = useUi((s) => s.openSettings)
  const { providers, provider, model } = useCurrentModel()

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

  const canSend = !!provider && !!model

  /** A new node always ends the active path, so keep the view pinned to the bottom. */
  const send = async (parentId: string | null, text: string) => {
    if (!provider || !model) return
    scroll.pin()
    let id = conversationId
    if (!id) {
      id = await createConversation()
      setConversation(id)
    }
    await sendMessage({ conversationId: id, parentId, text, provider, model })
  }

  // MessageNode is memoized; route its actions through a ref so the object never changes.
  const latest = useRef({ send, nodes })
  latest.current = { send, nodes }
  const actions = useMemo<NodeActions>(
    () => ({
      retry: (node) => latest.current.send(node.parentId, node.user.text),
      edit: (node, text) => latest.current.send(node.parentId, text),
      switchBranch: (node, delta) => {
        const sibs = siblingsOf(latest.current.nodes ?? [], node)
        const target = sibs[sibs.findIndex((s) => s.id === node.id) + delta]
        if (target) selectBranch(node.conversationId, node.parentId, target.id)
      },
    }),
    [],
  )

  const scroll = useAutoScroll(conversationId)
  const noProvider = providers && !provider

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <ModelPicker />
        <div className="min-w-0 flex-1 truncate text-center text-[13px] text-muted">{conversation?.title}</div>
        <div className="w-24" />
      </header>

      <div ref={scroll.containerRef} className="min-h-0 flex-1 overflow-y-auto">
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
              <EmptyState icon={<Sparkles size={22} />} title={t('chat.emptyTitle')} hint={t('chat.emptyHint')} />
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
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 pb-5">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            onSend={(text) => send(last?.id ?? null, text)}
            onStop={() => last && stopGeneration(last.id)}
            generating={generating}
            disabled={!canSend}
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
  hint: string
  action?: ReactNode
}) {
  return (
    <div className="anim-fade flex flex-col items-center pt-[18vh] text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * Keeps the view pinned to the bottom while content grows, unless the user has scrolled up.
 * Jumps to the bottom when switching conversations.
 */
function useAutoScroll(conversationId: string | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    const content = contentRef.current
    if (!el || !content) return
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    stick.current = true
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conversationId])

  const pin = () => {
    stick.current = true
  }

  return { containerRef, contentRef, pin }
}

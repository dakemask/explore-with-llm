import { MessageSquareText } from 'lucide-react'
import { type RefObject } from 'react'
import type { ChatNode, Conversation } from '../../db'
import { useT } from '../../i18n'
import { archiveThread, lacksReply, sendMessage, stopGeneration } from '../../lib/chat'
import type { ImageFile } from '../../lib/images'
import { ScrollHold, useAutoScroll } from '../../lib/hooks'
import { useSwitchMotion } from '../../lib/switchMotion'
import { useUi, type SideDraft } from '../../store/ui'
import { Composer } from '../chat/Composer'
import { MessageNode, Turn } from '../chat/MessageNode'
import { CurrentParams, ModelPicker, useCurrentModel } from '../chat/ModelPicker'
import { useSiblings } from '../chat/SiblingSwitcher'
import { useNodeActions } from '../chat/useNodeActions'
import { Dots } from '../ui/Dots'
import { confirmDialog } from '../ui/Dialog'
import { CardMenu, SideMenuItems } from './CardMenu'
import { collapseOnClick } from './SideColumn'

/**
 * A side question's title: the user's or the naming model's, else the fallback; bouncing dots while it's
 * being named (unless the user gave it a title meanwhile).
 */
export function ThreadTitle({ thread, conversation, fallback }: { thread: string; conversation: Conversation; fallback: string }) {
  const t = useT()
  const naming = useUi((s) => !!s.naming[thread])
  const title = conversation.threadTitles?.[thread]
  if (naming && title === undefined) return <Dots label={t('naming.pending')} />
  return <span className="truncate">{title ?? (fallback || t('image.only'))}</span>
}

/**
 * The expanded card of a side question in the column: its messages, a composer, its menu.
 * `path` is the thread as shown (empty for a draft); `nodeId` the main node it was asked from.
 */
export function SideCard({
  thread,
  nodeId,
  path,
  draft,
  conversation,
  nodes,
  fallback,
  dropTarget,
  onCollapse,
  onConvert,
}: {
  thread: string
  nodeId: string
  path: ChatNode[]
  draft?: SideDraft
  conversation: Conversation
  nodes: ChatNode[]
  /** Title until the naming model gives one (`sideFallbackTitle`). */
  fallback: string
  /** The card element (dropped images go to this composer). */
  dropTarget: RefObject<HTMLElement | null>
  onCollapse: () => void
  /** 转为分支 (`ChatView`). */
  onConvert: () => void
}) {
  const t = useT()
  const { provider, model, ready } = useCurrentModel()
  const saveDraft = useUi((s) => s.saveDraft)
  const root = path[0]
  const last = path[path.length - 1]

  const scroll = useAutoScroll(thread)
  const motion = useSwitchMotion(scroll, path, thread)
  const actions = useNodeActions(nodes, scroll.hold, motion)
  const siblings = useSiblings(path, nodes)

  // Text typed in this card's box would be lost (owner: ask first, only then).
  const convert = async () => {
    const box = dropTarget.current?.querySelector('textarea[data-composer]')
    if (box && !box.hasAttribute('data-pristine') && !(await confirmDialog(t('side.toBranchUnsent')))) return
    onConvert()
  }

  const send = (text: string, images: ImageFile[]) => {
    if (!provider || !model) return
    scroll.pin()
    void sendMessage({
      conversationId: conversation.id,
      parentId: last?.id ?? nodeId,
      text,
      images,
      provider,
      model,
      side: last ? { thread } : { thread, anchor: draft?.anchor },
    })
  }

  return (
    <>
      <header
        {...collapseOnClick(onCollapse)}
        className="flex shrink-0 cursor-pointer items-center gap-1 border-b border-border py-2 pr-2 pl-4"
      >
        <h2 className="flex h-7 min-w-0 flex-1 items-center gap-2 text-[13.5px] font-semibold">
          <MessageSquareText size={14} className="shrink-0 text-node" />
          <ThreadTitle thread={thread} conversation={conversation} fallback={fallback} />
          {!root && <span className="shrink-0 text-[11px] font-normal text-faint">{t('side.draft')}</span>}
        </h2>
        {root && (
          <CardMenu>
            <SideMenuItems
              conversation={conversation}
              thread={thread}
              fallback={fallback}
              nodes={nodes}
              onConvert={() => void convert()}
              onArchive={() => {
                onCollapse()
                void archiveThread(conversation.id, thread)
              }}
            />
          </CardMenu>
        )}
      </header>

      <div ref={scroll.containerRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] [--sticky-bg:var(--c-surface)]">
        <ScrollHold.Provider value={scroll.hold}>
          {/* The blank space at the bottom goes on this wrapper (see useAutoScroll). */}
          <div ref={scroll.blankRef} className="relative">
            <div ref={scroll.contentRef} className="px-4 pt-3 pb-5">
              {path.length === 0 ? (
                <p className="px-2 py-1 text-center text-[13px] leading-relaxed text-faint">{t('side.draftHint')}</p>
              ) : (
                path.map((n, i) => (
                  <Turn key={n.id} first={i === 0}>
                    <MessageNode node={n} siblings={siblings.get(n.id)} canSend={ready} actions={actions} />
                  </Turn>
                ))
              )}
            </div>
          </div>
        </ScrollHold.Provider>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <Composer
          key={thread}
          onSend={send}
          onStop={() => last && stopGeneration(last.id)}
          generating={last?.attempt.status === 'streaming'}
          disabled={!ready}
          placeholder={t('side.placeholder')}
          initialText={draft && !root ? draft.text : ''}
          initialImages={draft && !root ? draft.images : undefined}
          onLeave={draft && !root ? (text, images) => saveDraft(thread, text, images) : undefined}
          modelRow={<ModelPicker wide />}
          leading={<CurrentParams />}
          dropTarget={dropTarget}
          regenerate={lacksReply(last) ? { onClick: ready ? () => actions.retry(last) : undefined } : undefined}
        />
      </div>
    </>
  )
}

import clsx from 'clsx'
import { AlertCircle, Brain, Check, ChevronLeft, ChevronRight, Copy, Info, Lock, Pencil, RotateCcw } from 'lucide-react'
import { memo, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { useAutosize, useCopy } from '../../lib/hooks'
import type { AnchorMark } from '../../lib/anchor'
import { editAssistant } from '../../lib/chat'
import { useStoredImages, type ImageFile } from '../../lib/images'
import { hasReasoning, reasoningView, type ReasoningView } from '../../lib/reasoning'
import { useUi } from '../../store/ui'
import { Button, IconButton, Tip } from '../ui/Button'
import { AssistantEditor } from './AssistantEditor'
import { AttachButton, AttachmentStrip, DropHint, MessageImages, useAttachments } from './Images'
import { Markdown } from './Markdown'

/** Callbacks from ChatView. Kept referentially stable so memoized nodes don't re-render. */
export interface NodeActions {
  retry: (node: ChatNode) => void
  edit: (node: ChatNode, text: string, images: ImageFile[]) => void
  switchBranch: (node: ChatNode, delta: -1 | 1) => void
}

export const MessageNode = memo(function MessageNode({
  node,
  branchIndex,
  branchCount,
  canSend,
  actions,
  anchors,
}: {
  node: ChatNode
  /** Position among the sibling versions at this fork (0-based). */
  branchIndex: number
  branchCount: number
  canSend: boolean
  actions: NodeActions
  /**
   * Main-line nodes only: side-question anchors on the reply. Makes the reply selectable for new side
   * questions (the root carries `data-anchor-root`).
   */
  anchors?: AnchorMark[]
}) {
  const live = useUi((s) => s.live[node.id])
  const streaming = node.attempt.status === 'streaming'
  const content = live?.content ?? node.assistant.content
  const reasoning = live?.reasoning ?? node.assistant.reasoning ?? ''
  // An edited version carries its source's response, but not its reasoning.
  const message = node.edit ? undefined : node.attempt.message
  const thinking = useMemo(() => reasoningView(reasoning, message), [reasoning, message])
  const retry = canSend ? () => actions.retry(node) : undefined
  const detailOpen = useUi((s) => s.panel?.type === 'detail' && s.panel.nodeId === node.id)
  const toggleDetail = () => {
    const { panel, setPanel } = useUi.getState()
    if (detailOpen) setPanel(panel?.type === 'detail' ? (panel.back ?? null) : null)
    else setPanel({ type: 'detail', nodeId: node.id, back: panel?.type === 'side' ? panel : undefined })
  }
  const [editing, setEditing] = useState(false)
  const saveEdit = async (text: string) => {
    setEditing(false)
    // The edit is shown in this node's place; an unsent side question on this node would be left behind.
    const { panel, setPanel } = useUi.getState()
    if (panel?.type === 'side' && panel.draft && panel.nodeId === node.id) setPanel(null)
    await editAssistant(node, text)
  }

  return (
    <div className="space-y-3">
      <UserMessage
        text={node.user.text}
        images={node.user.images}
        onEdit={canSend ? (text, images) => actions.edit(node, text, images) : undefined}
        branch={
          branchCount > 1 && (
            <BranchSwitcher
              index={branchIndex}
              count={branchCount}
              onPrev={() => actions.switchBranch(node, -1)}
              onNext={() => actions.switchBranch(node, 1)}
            />
          )
        }
      />
      <div className="group/assistant">
        {hasReasoning(thinking) && <Reasoning view={thinking} live={streaming && !content} />}
        {editing ? (
          <AssistantEditor initial={node.assistant.content} onCancel={() => setEditing(false)} onSave={saveEdit} />
        ) : content ? (
          <div data-anchor-root={anchors && !streaming ? node.id : undefined}>
            <Markdown
              text={content}
              className={clsx(streaming && 'streaming-caret')}
              anchors={streaming ? undefined : anchors}
            />
          </div>
        ) : (
          streaming && !hasReasoning(thinking) && <TypingDots />
        )}
        {node.attempt.status === 'error' && !node.edit && <ErrorBox node={node} onRetry={retry} onDetail={toggleDetail} />}
        {!streaming && !editing && (
          <AssistantFooter
            node={node}
            content={content}
            onRetry={retry}
            onEdit={content ? () => setEditing(true) : undefined}
            detailOpen={detailOpen}
            onDetail={toggleDetail}
          />
        )}
      </div>
    </div>
  )
})

/** The highlight of a side question not sent yet (see ChatView); not a real anchor. */
export const DRAFT_PREFIX = 'draft:'

function UserMessage({
  text,
  images,
  branch,
  onEdit,
}: {
  text: string
  images?: string[]
  branch: ReactNode
  onEdit?: (text: string, images: ImageFile[]) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const { copied, copy } = useCopy()

  if (editing && onEdit) {
    return (
      <UserEditor
        initial={text}
        initialImages={images}
        onCancel={() => setEditing(false)}
        onSend={(next, nextImages) => {
          setEditing(false)
          onEdit(next, nextImages)
        }}
      />
    )
  }

  return (
    <div className="group/user flex flex-col items-end">
      {images && images.length > 0 && <MessageImages ids={images} />}
      {text && (
        <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5">
          <Markdown text={text} className="prose-user" breaks />
        </div>
      )}
      <div className="mt-1 flex h-7 items-center gap-1">
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100">
          {text && (
            <IconButton label={copied ? t('msg.copied') : t('msg.copy')} size="sm" onClick={() => copy(text)}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
          )}
          {onEdit && (
            <IconButton label={t('msg.edit')} size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} />
            </IconButton>
          )}
        </div>
        {branch}
      </div>
    </div>
  )
}

/** Inline editor for a user message (text and images). Sending creates a new sibling branch. */
function UserEditor({
  initial,
  initialImages,
  onCancel,
  onSend,
}: {
  initial: string
  initialImages?: string[]
  onCancel: () => void
  onSend: (text: string, images: ImageFile[]) => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const attachments = useAttachments(box)
  const stored = useStoredImages(initialImages)
  const loaded = useRef(false)
  if (stored && !loaded.current) {
    loaded.current = true
    if (stored.length) attachments.reset(stored)
  }
  useAutosize(ref, text, 400)
  const canSend = text.trim().length > 0 || attachments.images.length > 0
  const submit = () => {
    if (canSend) onSend(text.trim(), attachments.images)
  }

  return (
    <div
      ref={box}
      className="anim-fade relative ml-auto w-[85%] rounded-2xl border border-border-strong bg-surface shadow-composer"
    >
      <DropHint show={attachments.dragging} className="rounded-2xl" />
      <AttachmentStrip attachments={attachments} className="px-3.5 pt-3.5" />
      <textarea
        ref={ref}
        value={text}
        autoFocus
        onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
        onChange={(e) => setText(e.target.value)}
        onPaste={attachments.onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[15px] leading-relaxed focus:outline-none"
      />
      <div className="flex items-center gap-2 py-2.5 pr-2.5 pl-2.5">
        <AttachButton onFiles={attachments.add} />
        <span className="min-w-0 flex-1 truncate text-xs text-faint">{t('msg.editHint')}</span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" variant="primary" onClick={submit} disabled={!canSend}>
          {t('common.send')}
        </Button>
      </div>
    </div>
  )
}

function BranchSwitcher({
  index,
  count,
  onPrev,
  onNext,
}: {
  index: number
  count: number
  onPrev: () => void
  onNext: () => void
}) {
  const t = useT()
  return (
    <div className="flex items-center text-xs text-muted">
      <IconButton label={t('msg.prevBranch')} size="sm" onClick={onPrev} disabled={index === 0}>
        <ChevronLeft size={15} />
      </IconButton>
      <span className="min-w-9 text-center tabular-nums select-none">
        {index + 1} / {count}
      </span>
      <IconButton label={t('msg.nextBranch')} size="sm" onClick={onNext} disabled={index === count - 1}>
        <ChevronRight size={15} />
      </IconButton>
    </div>
  )
}

function Reasoning({ view, live }: { view: ReasoningView; live: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const expandable = !!view.text || view.summaries.length > 0
  const expanded = expandable && (open || live)
  const encryptedBytes = view.encrypted.reduce((a, b) => a + b, 0)
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          disabled={!expandable}
          className="flex items-center gap-1.5 rounded-md py-1 pr-1 text-[13px] text-muted transition-colors enabled:hover:text-text"
        >
          <Brain size={14} className={clsx(live && 'animate-pulse text-accent')} />
          {live ? t('msg.reasoningLive') : view.isSummary ? t('msg.reasoningSummary') : t('msg.reasoning')}
          {expandable && <ChevronRight size={14} className={clsx('transition-transform', expanded && 'rotate-90')} />}
        </button>
        {view.encrypted.length > 0 && (
          <Tip content={t('msg.encryptedHint')}>
            <span className="flex cursor-default items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] text-muted">
              <Lock size={11} />
              {t('msg.encrypted', { size: formatBytes(encryptedBytes) })}
            </span>
          </Tip>
        )}
      </div>
      {expanded && (
        <div className="mt-1.5 max-h-80 space-y-3 overflow-y-auto border-l-2 border-border pl-4">
          {view.text && <Markdown text={view.text} className="prose-reasoning" />}
          {view.summaries.map((s, i) => (
            <div key={i}>
              <div className="mb-0.5 text-[11px] font-medium text-faint">{t('msg.reasoningSummary')}</div>
              <Markdown text={s} className="prose-reasoning" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
}

function TypingDots() {
  return (
    <div className="flex h-7 items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-faint"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  )
}

function ErrorBox({ node, onRetry, onDetail }: { node: ChatNode; onRetry?: () => void; onDetail: () => void }) {
  const t = useT()
  const err = node.attempt.error
  if (!err) return null
  return (
    <div className="mt-3 flex gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13px]">
      <AlertCircle size={16} className="mt-px shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-danger">
          {t('msg.error')}
          {err.status ? ` · HTTP ${err.status}` : ''}
        </div>
        <div className="mt-0.5 break-words text-muted">{err.code === 'network' ? t('error.network') : err.message}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        <Button size="sm" variant="ghost" onClick={onDetail}>
          {t('detail.openShort')}
        </Button>
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            <RotateCcw size={13} />
            {t('msg.retryShort')}
          </Button>
        )}
      </div>
    </div>
  )
}

function AssistantFooter({
  node,
  content,
  onRetry,
  onEdit,
  detailOpen,
  onDetail,
}: {
  node: ChatNode
  content: string
  onRetry?: () => void
  onEdit?: () => void
  detailOpen: boolean
  onDetail: () => void
}) {
  const t = useT()
  const { copied, copy } = useCopy()
  const tags = [
    node.attempt.status === 'aborted' && !node.edit && t('msg.aborted'),
    node.edit && t('msg.edited'),
  ].filter(Boolean)
  return (
    <div className="mt-2 flex h-7 items-center gap-1 text-xs text-faint">
      {/* Status tags stay visible; actions reveal on hover. */}
      {tags.map((tag) => (
        <span key={String(tag)} className="mr-1 rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted">
          {tag}
        </span>
      ))}
      <div
        className={clsx(
          'flex items-center gap-1 transition-opacity group-hover/assistant:opacity-100 focus-within:opacity-100',
          !detailOpen && 'opacity-0',
        )}
      >
        {content && (
          <IconButton label={copied ? t('msg.copied') : t('msg.copy')} size="sm" onClick={() => copy(content)}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </IconButton>
        )}
        {onRetry && (
          <IconButton label={t('msg.retry')} size="sm" onClick={onRetry}>
            <RotateCcw size={14} />
          </IconButton>
        )}
        {onEdit && (
          <IconButton label={t('msg.editReply')} size="sm" onClick={onEdit}>
            <Pencil size={14} />
          </IconButton>
        )}
        <IconButton label={t('detail.open')} size="sm" active={detailOpen} onClick={onDetail}>
          <Info size={14} />
        </IconButton>
        <span className="ml-1">{node.attempt.model}</span>
      </div>
    </div>
  )
}

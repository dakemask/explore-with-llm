import clsx from 'clsx'
import { AlertCircle, Brain, Check, ChevronLeft, ChevronRight, Copy, Info, Pencil, RotateCcw } from 'lucide-react'
import { memo, useRef, useState, type ReactNode } from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { useAutosize, useCopy } from '../../lib/hooks'
import { useUi } from '../../store/ui'
import { Button, IconButton } from '../ui/Button'
import { Markdown } from './Markdown'

/** Callbacks from ChatView. Kept referentially stable so memoized nodes don't re-render. */
export interface NodeActions {
  retry: (node: ChatNode) => void
  edit: (node: ChatNode, text: string) => void
  switchBranch: (node: ChatNode, delta: -1 | 1) => void
}

export const MessageNode = memo(function MessageNode({
  node,
  branchIndex,
  branchCount,
  canSend,
  actions,
}: {
  node: ChatNode
  /** Position among the sibling versions at this fork (0-based). */
  branchIndex: number
  branchCount: number
  canSend: boolean
  actions: NodeActions
}) {
  const live = useUi((s) => s.live[node.id])
  const streaming = node.attempt.status === 'streaming'
  const content = live?.content ?? node.assistant.content
  const reasoning = live?.reasoning ?? node.assistant.reasoning ?? ''
  const retry = canSend ? () => actions.retry(node) : undefined
  const detailOpen = useUi((s) => s.panel?.type === 'detail' && s.panel.nodeId === node.id)
  const toggleDetail = () => useUi.getState().setPanel(detailOpen ? null : { type: 'detail', nodeId: node.id })

  return (
    <div className="space-y-3">
      <UserMessage
        text={node.user.text}
        onEdit={canSend ? (text) => actions.edit(node, text) : undefined}
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
        {reasoning && <Reasoning text={reasoning} live={streaming && !content} />}
        {content ? (
          <Markdown text={content} className={clsx(streaming && 'streaming-caret')} />
        ) : (
          streaming && !reasoning && <TypingDots />
        )}
        {node.attempt.status === 'error' && <ErrorBox node={node} onRetry={retry} onDetail={toggleDetail} />}
        {!streaming && (
          <AssistantFooter
            node={node}
            content={content}
            onRetry={retry}
            detailOpen={detailOpen}
            onDetail={toggleDetail}
          />
        )}
      </div>
    </div>
  )
})

function UserMessage({
  text,
  branch,
  onEdit,
}: {
  text: string
  branch: ReactNode
  onEdit?: (text: string) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const { copied, copy } = useCopy()

  if (editing && onEdit) {
    return (
      <UserEditor
        initial={text}
        onCancel={() => setEditing(false)}
        onSend={(next) => {
          setEditing(false)
          onEdit(next)
        }}
      />
    )
  }

  return (
    <div className="group/user flex flex-col items-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
      <div className="mt-1 flex h-7 items-center gap-1">
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100">
          <IconButton label={copied ? t('msg.copied') : t('msg.copy')} size="sm" onClick={() => copy(text)}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </IconButton>
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

/** Inline editor for a user message. Sending creates a new sibling branch. */
function UserEditor({
  initial,
  onCancel,
  onSend,
}: {
  initial: string
  onCancel: () => void
  onSend: (text: string) => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutosize(ref, text, 400)
  const canSend = text.trim().length > 0
  const submit = () => {
    if (canSend) onSend(text.trim())
  }

  return (
    <div className="anim-fade ml-auto w-[85%] rounded-2xl border border-border-strong bg-surface shadow-composer">
      <textarea
        ref={ref}
        value={text}
        autoFocus
        onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[15px] leading-relaxed focus:outline-none"
      />
      <div className="flex items-center gap-2 py-2.5 pr-2.5 pl-4">
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

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const expanded = open || live
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md py-1 pr-2 text-[13px] text-muted transition-colors hover:text-text"
      >
        <Brain size={14} className={clsx(live && 'animate-pulse text-accent')} />
        {live ? t('msg.reasoningLive') : t('msg.reasoning')}
        <ChevronRight size={14} className={clsx('transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="mt-1.5 max-h-80 overflow-y-auto border-l-2 border-border pl-4 text-[13px] leading-relaxed whitespace-pre-wrap text-muted">
          {text}
        </div>
      )}
    </div>
  )
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
  detailOpen,
  onDetail,
}: {
  node: ChatNode
  content: string
  onRetry?: () => void
  detailOpen: boolean
  onDetail: () => void
}) {
  const t = useT()
  const { copied, copy } = useCopy()
  const tags = [
    node.attempt.status === 'aborted' && t('msg.aborted'),
    node.assistant.edited && t('msg.edited'),
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
        <IconButton label={t('detail.open')} size="sm" active={detailOpen} onClick={onDetail}>
          <Info size={14} />
        </IconButton>
        <span className="ml-1">{node.attempt.model}</span>
      </div>
    </div>
  )
}

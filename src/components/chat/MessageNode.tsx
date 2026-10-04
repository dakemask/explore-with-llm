import clsx from 'clsx'
import { AlertCircle, Brain, Check, ChevronRight, Copy } from 'lucide-react'
import { memo, useState } from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { copyText } from '../../lib/clipboard'
import { useUi } from '../../store/ui'
import { IconButton } from '../ui/Button'
import { Markdown } from './Markdown'

export const MessageNode = memo(function MessageNode({ node }: { node: ChatNode }) {
  const live = useUi((s) => s.live[node.id])
  const streaming = node.attempt.status === 'streaming'
  const content = live?.content ?? node.assistant.content
  const reasoning = live?.reasoning ?? node.assistant.reasoning ?? ''

  return (
    <div className="space-y-5">
      <UserMessage text={node.user.text} />
      <div className="group/assistant">
        {reasoning && <Reasoning text={reasoning} live={streaming && !content} />}
        {content ? (
          <Markdown text={content} className={clsx(streaming && 'streaming-caret')} />
        ) : (
          streaming && !reasoning && <TypingDots />
        )}
        {node.attempt.status === 'error' && <ErrorBox node={node} />}
        {!streaming && <AssistantFooter node={node} content={content} />}
      </div>
    </div>
  )
})

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
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

function ErrorBox({ node }: { node: ChatNode }) {
  const t = useT()
  const err = node.attempt.error
  if (!err) return null
  return (
    <div className="mt-3 flex gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13px]">
      <AlertCircle size={16} className="mt-px shrink-0 text-danger" />
      <div className="min-w-0">
        <div className="font-medium text-danger">
          {t('msg.error')}
          {err.status ? ` · HTTP ${err.status}` : ''}
        </div>
        <div className="mt-0.5 break-words text-muted">{err.code === 'network' ? t('error.network') : err.message}</div>
      </div>
    </div>
  )
}

function AssistantFooter({ node, content }: { node: ChatNode; content: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await copyText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
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
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/assistant:opacity-100 focus-within:opacity-100">
        {content && (
          <IconButton label={copied ? t('msg.copied') : t('msg.copy')} size="sm" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </IconButton>
        )}
        <span className="ml-1">{node.attempt.model}</span>
      </div>
    </div>
  )
}

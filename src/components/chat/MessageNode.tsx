import clsx from 'clsx'
import { Archive, AlertCircle, Brain, Check, ChevronRight, Copy, GitBranch, Info, Lock, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { useCopy, useScrollHold } from '../../lib/hooks'
import type { AnchorMark } from '../../lib/anchor'
import { archiveNode, editAssistant, makeBranch } from '../../lib/chat'
import { colorVar } from '../../lib/colors'
import type { ImageFile } from '../../lib/images'
import { hasReasoning, reasoningView, type ReasoningView } from '../../lib/reasoning'
import { forkKey } from '../../lib/tree'
import { useUi } from '../../store/ui'
import { Button, IconButton, Tip } from '../ui/Button'
import { Dots } from '../ui/Dots'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'
import { AssistantEditDialog, UserEditDialog } from './EditDialogs'
import { MessageImages } from './Images'
import { Markdown } from './Markdown'
import { SiblingSwitcher, type Siblings } from './SiblingSwitcher'
import { atFork } from './useNodeActions'

/** Callbacks from ChatView. Kept referentially stable so memoized nodes don't re-render. */
export interface NodeActions {
  retry: (node: ChatNode) => void
  edit: (node: ChatNode, text: string, images: ImageFile[]) => void
  /** Shows `id` (a sibling of `node`) at their fork. */
  select: (node: ChatNode, id: string) => void
}

/** Highlights on a main-line node: side questions and notes on the reply, notes on the user message. */
export interface NodeMarks {
  reply: AnchorMark[]
  user: AnchorMark[]
}

export const MessageNode = memo(function MessageNode({
  node,
  siblings,
  canSend,
  actions,
  marks,
  busy,
}: {
  node: ChatNode
  /** The other versions at this fork (none if it has no siblings); see `useSiblings`. */
  siblings?: Siblings
  canSend: boolean
  actions: NodeActions
  /**
   * Main-line nodes only: highlights on the reply and the user message. Makes both selectable for new side
   * questions / notes (their roots carry `data-anchor-root`, and `data-anchor-target="user"` on the message).
   */
  marks?: NodeMarks
  /** A reply is streaming in this node or below it (it can't be archived now). */
  busy?: boolean
}) {
  const live = useUi((s) => s.live[node.id])
  const streaming = node.attempt.status === 'streaming'
  const content = live?.content ?? node.assistant.content
  const reasoning = live?.reasoning ?? node.assistant.reasoning ?? ''
  // An edited version carries its source's response, but not its reasoning.
  const message = node.edit ? undefined : node.attempt.message
  const thinking = useMemo(() => reasoningView(reasoning, message), [reasoning, message])
  const retry = canSend ? () => actions.retry(node) : undefined
  const openDetail = () => useUi.getState().setPanel({ type: 'detail', nodeId: node.id })
  const hold = useScrollHold()
  const [editing, setEditing] = useState(false)
  // The new version takes the original's place on screen.
  const saveEdit = (text: string) => {
    hold(atFork(node))
    void editAssistant(node, text)
  }
  const errorBox = node.attempt.status === 'error' && !node.edit && !!node.attempt.error
  // Always visible (not only on hover), at the right end of the footer, or of the error box's actions.
  const switcher = siblings && <SiblingSwitcher info={siblings} onSelect={(id) => actions.select(node, id)} />

  return (
    <div data-fork={forkKey(node)} className="space-y-3">
      <UserMessage
        nodeId={node.id}
        anchors={marks?.user}
        text={node.user.text}
        images={node.user.images}
        onEdit={canSend ? (text, images) => actions.edit(node, text, images) : undefined}
      />
      <div className="group/assistant">
        {hasReasoning(thinking) && <Reasoning view={thinking} live={streaming && !content} />}
        {editing && (
          <AssistantEditDialog initial={node.assistant.content} onClose={() => setEditing(false)} onSave={saveEdit} />
        )}
        {content ? (
          <div data-anchor-root={marks && !streaming ? node.id : undefined}>
            <Markdown
              text={content}
              className={clsx(streaming && 'streaming-caret')}
              anchors={streaming ? undefined : marks?.reply}
            />
          </div>
        ) : (
          streaming && !hasReasoning(thinking) && <TypingDots since={node.attempt.startedAt} />
        )}
        {errorBox && <ErrorBox node={node} onDetail={openDetail} />}
        {streaming ? (
          // While streaming only the switcher shows (the reply's actions come once it's done).
          switcher && (
            <div data-switcher className="mt-2 flex h-7 items-center justify-end">
              {switcher}
            </div>
          )
        ) : (
          <AssistantFooter
            node={node}
            content={content}
            onRetry={retry}
            // Also on a reply without text (failed, stopped early): the user may write one, as a new version.
            onEdit={() => setEditing(true)}
            onDetail={openDetail}
            busy={!!busy}
            switcher={switcher}
          />
        )}
      </div>
    </div>
  )
})

/**
 * One turn (user message + reply) in a list: a thin separator above it (except the first) and, in the
 * main chat, a slim bar in the left gutter in the turn's branch color, flowing in from the parent's color
 * where it changes (`lib/colors.ts`).
 */
export function Turn({
  id,
  first,
  color,
  from,
  children,
}: {
  /** The node id, as `data-turn` (the tree map finds turns in the chat by it). */
  id?: string
  first: boolean
  color?: number
  from?: number
  children: ReactNode
}) {
  return (
    <div data-turn={id} className={clsx(!first && 'mt-8 border-t border-border pt-8')}>
      <div className="relative">
        {color !== undefined && (
          <div
            aria-hidden
            className="absolute top-0 bottom-0 -left-4 w-[3px] rounded-full"
            style={{
              background:
                from !== undefined && from !== color
                  ? `linear-gradient(in oklch, ${colorVar(from)}, ${colorVar(color)} 48px)`
                  : colorVar(color),
            }}
          />
        )}
        {children}
      </div>
    </div>
  )
}

/** The highlight of a side question not sent yet (see ChatView); not a real anchor. */
export const DRAFT_PREFIX = 'draft:'

function UserMessage({
  nodeId,
  anchors,
  text,
  images,
  onEdit,
}: {
  nodeId: string
  /** Note highlights (main line only; makes the text selectable for new notes). */
  anchors?: AnchorMark[]
  text: string
  images?: string[]
  onEdit?: (text: string, images: ImageFile[]) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const { copied, copy } = useCopy()

  return (
    <div className="group/user flex flex-col items-end">
      {editing && onEdit && (
        <UserEditDialog initial={text} initialImages={images} onClose={() => setEditing(false)} onSend={onEdit} />
      )}
      {images && images.length > 0 && <MessageImages ids={images} />}
      {text && (
        <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5">
          <div data-anchor-root={anchors ? nodeId : undefined} data-anchor-target={anchors ? 'user' : undefined}>
            <Markdown text={text} className="prose-user" breaks anchors={anchors} />
          </div>
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
      </div>
    </div>
  )
}

/**
 * The reasoning, folded under a toggle. Unfolded it shows in full (no inner scrolling); while the user
 * reads further down, the toggle sticks to the top of the scroll area so it can be folded from there.
 * Folding and unfolding keep the toggle where it was on screen (`useScrollHold`).
 */
function Reasoning({ view, live }: { view: ReasoningView; live: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const hold = useScrollHold()
  const toggle = useRef<HTMLButtonElement>(null)
  const expandable = !!view.text || view.summaries.length > 0
  const expanded = expandable && (open || live)
  const encryptedBytes = view.encrypted.reduce((a, b) => a + b, 0)
  return (
    <div className="mb-4">
      {/* The fade under it covers text scrolling underneath while it sticks. */}
      <div className="sticky top-0 z-[2] flex items-center gap-2 bg-(--sticky-bg) after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-1.5 after:bg-linear-to-b after:from-(--sticky-bg) after:to-transparent">
        <button
          ref={toggle}
          onClick={() => {
            if (toggle.current) hold(toggle.current)
            setOpen(!open)
          }}
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
        <div className="mt-1.5 space-y-3 border-l-2 border-border pl-4">
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

/** Shown until the first output arrives; after a few seconds also how long it has been waiting. */
function TypingDots({ since }: { since: number }) {
  const t = useT()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.floor((now - since) / 1000)
  return (
    <div className="flex h-7 items-center">
      <Dots />
      {seconds >= 5 && <span className="ml-2 text-xs text-faint tabular-nums">{t('msg.waiting', { n: seconds })}</span>}
    </div>
  )
}

function ErrorBox({
  node,
  onDetail,
}: {
  node: ChatNode
  onDetail: () => void
}) {
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
        <div className="mt-0.5 break-words text-muted">{err.code ? t(`error.${err.code}`) : err.message}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        <Button size="sm" variant="ghost" onClick={onDetail}>
          {t('detail.openShort')}
        </Button>
      </div>
    </div>
  )
}

function AssistantFooter({
  node,
  content,
  onRetry,
  onEdit,
  onDetail,
  busy,
  switcher,
}: {
  node: ChatNode
  content: string
  onRetry?: () => void
  onEdit?: () => void
  onDetail: () => void
  busy: boolean
  switcher?: ReactNode
}) {
  const t = useT()
  const { copied, copy } = useCopy()
  const [menuOpen, setMenuOpen] = useState(false)
  const tags = [
    node.attempt.status === 'aborted' && !node.edit && t('msg.aborted'),
    node.edit && t('msg.edited'),
  ].filter(Boolean)
  return (
    // Wraps only in narrow places (a side-question card): the switcher then gets its own line, right-aligned.
    <div className="mt-2 flex min-h-7 flex-wrap items-center gap-x-1 gap-y-1 text-xs text-faint">
      {/* Status tags stay visible; actions reveal on hover. */}
      {tags.map((tag) => (
        <span key={String(tag)} className="mr-1 rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted">
          {tag}
        </span>
      ))}
      <div
        className={clsx(
          'flex max-w-full min-w-0 items-center gap-1 transition-opacity group-hover/assistant:opacity-100 focus-within:opacity-100',
          !menuOpen && 'opacity-0',
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
        <IconButton label={t('detail.open')} size="sm" onClick={onDetail}>
          <Info size={14} />
        </IconButton>
        <span className="ml-1 min-w-0 truncate whitespace-nowrap">{node.attempt.model}</span>
        {/* Side-thread nodes have no menu: a side question is archived as a whole from its card. */}
        {node.kind === 'main' && (
          <MenuRoot open={menuOpen} onOpenChange={setMenuOpen}>
            <MenuTrigger asChild>
              <IconButton label={t('msg.more')} size="sm" active={menuOpen} className="ml-1">
                <MoreHorizontal size={15} />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              {!node.branch && (
                <MenuItem icon={<GitBranch size={14} />} onSelect={() => void makeBranch(node.id)}>
                  {t('msg.makeBranch')}
                </MenuItem>
              )}
              {busy ? (
                <Tip content={t('archive.busy')}>
                  <MenuItem icon={<Archive size={14} />} disabled onSelect={() => {}}>
                    {t('msg.archive')}
                  </MenuItem>
                </Tip>
              ) : (
                <MenuItem icon={<Archive size={14} />} onSelect={() => void archiveNode(node.id)}>
                  {t('msg.archive')}
                </MenuItem>
              )}
            </MenuContent>
          </MenuRoot>
        )}
      </div>
      {switcher && (
        <div data-switcher className="ml-auto flex h-7 items-center pl-2">
          {switcher}
        </div>
      )}
    </div>
  )
}

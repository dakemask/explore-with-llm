import clsx from 'clsx'
import { Archive, AlertCircle, Brain, Check, ChevronRight, Copy, GitBranch, Info, Lock, MoreHorizontal, Pencil, RotateCcw, Tag } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ChatNode } from '../../db'
import { useT } from '../../i18n'
import { useCopy, useScrollHold } from '../../lib/hooks'
import type { AnchorMark } from '../../lib/anchor'
import { archiveNode, editAssistant, makeBranch } from '../../lib/chat'
import { focusComposer } from '../../lib/focus'
import type { ImageFile } from '../../lib/images'
import { hasReasoning, reasoningView, type ReasoningView } from '../../lib/reasoning'
import { forkKey } from '../../lib/tree'
import { useUi } from '../../store/ui'
import { Button, IconButton, Tip } from '../ui/Button'
import { Dots } from '../ui/Dots'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'
import { AssistantEditDialog, UserEditDialog } from './EditDialogs'
import { MessageImages } from './Images'
import { editLabel } from './labels'
import { Markdown } from './Markdown'
import { SiblingSwitcher, type Siblings } from './SiblingSwitcher'
import { SystemRow } from './SystemMessage'
import { atFork } from './useNodeActions'

/** Callbacks from ChatView. Kept referentially stable so memoized nodes don't re-render. */
export interface NodeActions {
  retry: (node: ChatNode) => void
  /** `system`: a first turn's system message as edited ('' = none). */
  edit: (node: ChatNode, text: string, images: ImageFile[], system?: string) => void
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
  const streaming = node.attempt.status === 'streaming'
  // The streamed text shows until the stored node says the reply is over; only then is it dropped, so
  // there's never a frame between the two (clearing it first showed the empty stored reply for a moment).
  const streamed = useUi((s) => s.live[node.id])
  const live = streaming ? streamed : undefined
  useEffect(() => {
    if (!streaming && streamed) useUi.getState().setLive(node.id, null)
  }, [streaming, streamed, node.id])
  const content = live?.content ?? node.assistant.content
  const reasoning = live?.reasoning ?? node.assistant.reasoning ?? ''
  // An edited version carries its source's response, but not its reasoning.
  const message = node.edit ? undefined : node.attempt.message
  const thinking = useMemo(() => reasoningView(reasoning, message), [reasoning, message])
  const retry = canSend ? () => actions.retry(node) : undefined
  const openDetail = () => useUi.getState().setPanel({ type: 'detail', nodeId: node.id })
  const hold = useScrollHold()
  const [editing, setEditing] = useState(false)
  /** The user message editor is open (`system`: opened from the system message). */
  const [editingUser, setEditingUser] = useState<false | 'user' | 'system'>(false)
  const first = node.kind === 'main' && node.parentId === null
  // The new version takes the original's place on screen.
  const saveEdit = (text: string) => {
    hold(atFork(node))
    void editAssistant(node, text)
  }
  const errorBox = node.attempt.status === 'error' && !node.edit && !!node.attempt.error

  return (
    // Main chat: the header is on the frame's border above it (1 + 20 px up, 15 more above the border), so a
    // hold that brings this to the top (a retry / edit) keeps the header in view.
    <div data-fork={forkKey(node)} data-node={node.id} className={clsx(node.kind === 'main' && 'scroll-mt-10')}>
      <NodeHeader
        node={node}
        switcher={siblings && <SiblingSwitcher info={siblings} onSelect={(id) => actions.select(node, id)} />}
        onDetail={openDetail}
        busy={!!busy}
      />
      {/* data-node-body: what a switch animates (the header stays, see lib/switchMotion). */}
      <div data-node-body className="space-y-3">
        {editingUser && (
          <UserEditDialog
            initial={node.user.text}
            initialImages={node.user.images}
            system={first ? (node.system ?? '') : undefined}
            focusSystem={editingUser === 'system'}
            onClose={() => setEditingUser(false)}
            onSend={(text, images, system) => actions.edit(node, text, images, system)}
          />
        )}
        {first && <SystemRow text={node.system} onClick={canSend ? () => setEditingUser('system') : undefined} />}
        <UserMessage
          nodeId={node.id}
          anchors={marks?.user}
          text={node.user.text}
          images={node.user.images}
          onEdit={canSend ? () => setEditingUser('user') : undefined}
        />
        {/* data-reply: the reply part (scripts find it by this). */}
        <div data-reply>
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
          {/* The reply's actions come once it's done. */}
          {!streaming && (
            <AssistantFooter
              node={node}
              content={content}
              onRetry={retry}
              // Also on a reply without text (failed, stopped early): the user may write one, as a new version.
              onEdit={() => setEditing(true)}
            />
          )}
        </div>
      </div>
    </div>
  )
})

/**
 * One turn (user message + reply, a first turn's system message too) in a list. Main chat (`framed`): a thin
 * rounded frame around it, drawn 12 px outside the text so the text keeps its width (owner: one node = one
 * frame). Side cards: a thin separator above it (except the first) — a card is narrow and a frame itself.
 */
export function Turn({
  id,
  first,
  framed,
  color,
  children,
}: {
  /** The node id, as `data-turn` (the tree map finds turns in the chat by it). */
  id?: string
  first: boolean
  framed?: boolean
  /** Its branch color (CSS value): what its side questions' and notes' highlights are tinted with. */
  color?: string
  children: ReactNode
}) {
  return (
    <div
      data-turn={id}
      style={color ? ({ '--node': color } as CSSProperties) : undefined}
      className={clsx(
        framed
          ? // Room for the node header sitting on the top border (24 px apart, owner, 2026-10-08); brought to
            // the top (a jump), the header shows.
            ['relative -mx-3 scroll-mt-5 rounded-xl border border-border-strong px-3 pt-5 pb-3', !first && 'mt-6']
          : !first && 'mt-6 border-t border-border-strong pt-4',
      )}
    >
      {children}
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
  /** Opens the message editor. */
  onEdit?: () => void
}) {
  const t = useT()
  const { copied, copy } = useCopy()

  return (
    <div className="flex flex-col items-end">
      {images && images.length > 0 && <MessageImages ids={images} />}
      {text && (
        <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5">
          <div data-anchor-root={anchors ? nodeId : undefined} data-anchor-target={anchors ? 'user' : undefined}>
            <Markdown text={text} className="prose-user" breaks anchors={anchors} />
          </div>
        </div>
      )}
      <div className="mt-1 flex h-7 items-center gap-1">
        <div className="flex items-center gap-1">
          {text && (
            <IconButton label={copied ? t('msg.copied') : t('msg.copy')} size="sm" onClick={() => copy(text)}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
          )}
          {onEdit && (
            <IconButton label={t('msg.edit')} size="sm" onClick={onEdit}>
              <Pencil size={14} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The reasoning, folded under a toggle; it opens and closes only when the user says so, also while it is
 * still streaming (owner). Unfolded it shows in full (no inner scrolling); while the user reads further
 * down, the toggle sticks to the top of the scroll area so it can be folded from there. Folding and
 * unfolding keep the toggle where it was on screen (`useScrollHold`).
 */
function Reasoning({ view, live }: { view: ReasoningView; live: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const hold = useScrollHold()
  const toggle = useRef<HTMLButtonElement>(null)
  const expandable = !!view.text || view.summaries.length > 0
  const expanded = expandable && open
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

/**
 * The node's header (owner, 2026-10-08): the sibling switcher (always shown, also while streaming) and the ⋯
 * menu, at the top left where the user message is in view. Main chat: sitting on the turn frame's top border
 * (the frame line stops behind it); side cards: a row above the user message. Main nodes show the switcher
 * even without siblings (one dot, telling branch from attempt); side nodes only with ≥ 2 versions.
 */
function NodeHeader({
  node,
  switcher,
  onDetail,
  busy,
}: {
  node: ChatNode
  switcher?: ReactNode
  onDetail: () => void
  busy: boolean
}) {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const main = node.kind === 'main'
  return (
    <div
      className={clsx(
        'flex h-7 items-center gap-0.5',
        main ? 'absolute top-[-15px] left-2 bg-(--sticky-bg) px-1' : '-ml-1',
      )}
    >
      {switcher && (
        <div data-switcher className="flex h-7 items-center">
          {switcher}
        </div>
      )}
      <MenuRoot open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuTrigger asChild>
          <IconButton label={t('msg.more')} size="sm" active={menuOpen}>
            <MoreHorizontal size={15} />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          {/* Side-thread nodes: details only; a side question is archived as a whole from its card. */}
          {main && (
            <>
              <MenuItem icon={<Tag size={14} />} onSelect={() => void editLabel(node, t)}>
                {t('label.menu')}
              </MenuItem>
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
            </>
          )}
          <MenuItem icon={<Info size={14} />} onSelect={onDetail}>
            {t('detail.open')}
          </MenuItem>
        </MenuContent>
      </MenuRoot>
    </div>
  )
}

function AssistantFooter({
  node,
  content,
  onRetry,
  onEdit,
}: {
  node: ChatNode
  content: string
  onRetry?: () => void
  onEdit?: () => void
}) {
  const t = useT()
  const { copied, copy } = useCopy()
  const tags = [
    node.attempt.status === 'aborted' && !node.edit && t('msg.aborted'),
    node.edit && t('msg.edited'),
  ].filter(Boolean)
  return (
    <div className="mt-2 flex min-h-7 flex-wrap items-center gap-x-1 gap-y-1 text-xs text-faint">
      {/* Status tags, then the actions (always shown; owner, 2026-10-08). */}
      {tags.map((tag) => (
        <span key={String(tag)} className="mr-1 rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted">
          {tag}
        </span>
      ))}
      <div className="flex max-w-full min-w-0 items-center gap-1">
        {content && (
          <IconButton label={copied ? t('msg.copied') : t('msg.copy')} size="sm" onClick={() => copy(content)}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </IconButton>
        )}
        {onRetry && (
          <IconButton
            label={t('msg.retry')}
            size="sm"
            onClick={(e) => {
              onRetry()
              // The button goes away with the new attempt; typing continues in this place's box.
              focusComposer(e.currentTarget)
            }}
          >
            <RotateCcw size={14} />
          </IconButton>
        )}
        {onEdit && (
          <IconButton label={t('msg.editReply')} size="sm" onClick={onEdit}>
            <Pencil size={14} />
          </IconButton>
        )}
        <span className="ml-1 min-w-0 truncate whitespace-nowrap">{node.attempt.model}</span>
      </div>
    </div>
  )
}

import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Download, FileUp, MessagesSquare, MoreHorizontal, Pencil, SquarePen, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { db, type Conversation } from '../../db'
import { useT } from '../../i18n'
import { deleteConversation, renameConversation } from '../../lib/chat'
import { download, exportConversation, importConversation } from '../../lib/transfer'
import { useUi } from '../../store/ui'
import { IconButton } from '../ui/Button'
import { Dots } from '../ui/Dots'
import { confirmDialog, promptDialog } from '../ui/Dialog'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '../ui/Popover'
import { notifyError } from '../ui/Toast'
import { ArchiveDialog } from './ArchiveDialog'

/**
 * The conversation list: a card dropping down from the chat header's top-left button (owner, 2026-10-08:
 * no sidebar). New chat and import sit at its top. Picking a conversation (or 新对话) leaves it open; Escape, a click outside and the button close it.
 * Focus moving out (opening a conversation focuses its input box; a dialog from an item's menu) doesn't.
 */
export function ConversationList() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label={t('pane.list')} active={open}>
          <MessagesSquare size={17} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        ref={card}
        side="bottom"
        align="start"
        className="flex w-72 flex-col overflow-hidden! max-h-[min(70vh,var(--radix-popover-content-available-height))]!"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          card.current?.focus({ preventScroll: true })
        }}
        onFocusOutside={(e) => e.preventDefault()}
        // Closing hands focus back to the button only if it was still in the card (not if the user went on to
        // type in the conversation it opened).
        onCloseAutoFocus={(e) => {
          const active = document.activeElement
          if (active && active !== document.body && !card.current?.contains(active)) e.preventDefault()
        }}
      >
        <List />
      </PopoverContent>
    </PopoverRoot>
  )
}

function List() {
  const t = useT()
  const conversations = useLiveQuery(() => db.conversations.orderBy('updatedAt').reverse().toArray(), [])
  const currentId = useUi((s) => s.conversationId)
  const setConversation = useUi((s) => s.setConversation)

  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const today = conversations?.filter((c) => c.updatedAt >= startOfToday) ?? []
  const earlier = conversations?.filter((c) => c.updatedAt < startOfToday) ?? []

  // Opens showing the current conversation.
  const nav = useRef<HTMLElement>(null)
  const loaded = !!conversations
  useEffect(() => {
    nav.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' })
  }, [loaded])

  const fileInput = useRef<HTMLInputElement>(null)
  const importFile = async (file: File) => {
    try {
      setConversation(await importConversation(await file.text()))
    } catch (e) {
      notifyError(t('conv.importFailed'), t('conv.importInvalid', { reason: e instanceof Error ? e.message : String(e) }))
    }
  }

  return (
    <>
      <div className="flex shrink-0 gap-2 border-b border-border p-2">
        {/* The conversation record is created lazily on the first message. */}
        <button
          onClick={() => setConversation(null)}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium shadow-xs transition-colors hover:bg-hover"
        >
          <SquarePen size={15} className="text-muted" />
          {t('sidebar.newChat')}
        </button>
        <IconButton
          label={t('conv.import')}
          onClick={() => fileInput.current?.click()}
          className="size-9! rounded-lg border border-border bg-surface shadow-xs"
        >
          <FileUp size={15} />
        </IconButton>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importFile(file)
          }}
        />
      </div>
      <nav ref={nav} data-conversation-list className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {conversations && conversations.length === 0 && (
          <div className="px-2 py-8 text-center text-[13px] text-faint">{t('sidebar.empty')}</div>
        )}
        <Group label={t('sidebar.today')} items={today} currentId={currentId} onSelect={setConversation} />
        <Group label={t('sidebar.earlier')} items={earlier} currentId={currentId} onSelect={setConversation} />
      </nav>
    </>
  )
}

function Group({
  label,
  items,
  currentId,
  onSelect,
}: {
  label: string
  items: Conversation[]
  currentId: string | null
  onSelect: (id: string | null) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mt-2">
      <div className="px-2 pb-1 text-[11px] font-medium tracking-wide text-faint">{label}</div>
      <ul className="space-y-px">
        {items.map((c) => (
          <ConversationItem key={c.id} conv={c} active={c.id === currentId} onSelect={onSelect} />
        ))}
      </ul>
    </div>
  )
}

function ConversationItem({
  conv,
  active,
  onSelect,
}: {
  conv: Conversation
  active: boolean
  onSelect: (id: string | null) => void
}) {
  const t = useT()
  const naming = useUi((s) => !!s.naming[conv.id])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const rename = async () => {
    const title = await promptDialog(t('conv.rename'), conv.title)
    if (title?.trim()) await renameConversation(conv.id, title.trim())
  }
  const exportIt = async () => {
    const { name, json } = await exportConversation(conv.id)
    download(name, json)
  }
  const remove = async () => {
    if (!(await confirmDialog(t('conv.deleteConfirm'), { danger: true }))) return
    await deleteConversation(conv.id)
    if (active) onSelect(null)
  }
  return (
    <li className="group relative">
      <button
        onClick={() => onSelect(conv.id)}
        aria-current={active || undefined}
        className={clsx(
          'flex h-8 w-full items-center rounded-md pr-8 pl-2.5 text-left text-[13px] transition-colors',
          active ? 'bg-active font-medium text-text' : 'text-muted hover:bg-hover hover:text-text',
        )}
      >
        {naming ? <Dots label={t('naming.pending')} /> : <span className="truncate">{conv.title || t('conv.untitled')}</span>}
      </button>
      <MenuRoot>
        <MenuTrigger asChild>
          <button
            aria-label="More"
            className={clsx(
              'absolute top-1 right-1 flex size-6 items-center justify-center rounded text-faint hover:bg-active hover:text-text',
              'opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100',
            )}
          >
            <MoreHorizontal size={15} />
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuItem icon={<Pencil size={14} />} onSelect={rename}>
            {t('conv.rename')}
          </MenuItem>
          <MenuItem icon={<Download size={14} />} onSelect={exportIt}>
            {t('conv.export')}
          </MenuItem>
          <MenuItem icon={<Archive size={14} />} onSelect={() => setArchiveOpen(true)}>
            {t('conv.archive')}
          </MenuItem>
          <MenuItem icon={<Trash2 size={14} />} danger onSelect={remove}>
            {t('conv.delete')}
          </MenuItem>
        </MenuContent>
      </MenuRoot>
      <ArchiveDialog conversation={conv} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </li>
  )
}

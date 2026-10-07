import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Download, FileUp, MoreHorizontal, PanelLeftClose, Pencil, Settings, SquarePen, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { db, type Conversation } from '../../db'
import { useT } from '../../i18n'
import { deleteConversation, renameConversation } from '../../lib/chat'
import { PANE_DEFAULT, PANE_MAX, PANE_MIN } from '../../lib/panes'
import { download, exportConversation, importConversation } from '../../lib/transfer'
import { useSettings } from '../../store/settings'
import { useUi } from '../../store/ui'
import { IconButton } from '../ui/Button'
import { Dots } from '../ui/Dots'
import { confirmDialog, promptDialog } from '../ui/Dialog'
import { ResizeHandle } from '../ui/ResizeHandle'
import { notifyError } from '../ui/Toast'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'
import { ArchiveDialog } from './ArchiveDialog'

export function Sidebar() {
  const t = useT()
  const conversations = useLiveQuery(() => db.conversations.orderBy('updatedAt').reverse().toArray(), [])
  const currentId = useUi((s) => s.conversationId)
  const setConversation = useUi((s) => s.setConversation)
  const openSettings = useUi((s) => s.openSettings)
  const pane = useSettings((s) => s.panes.list)
  const setPane = useSettings((s) => s.setPane)

  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const today = conversations?.filter((c) => c.updatedAt >= startOfToday) ?? []
  const earlier = conversations?.filter((c) => c.updatedAt < startOfToday) ?? []

  // The conversation record is created lazily on the first message.
  const newChat = () => setConversation(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const importFile = async (file: File) => {
    try {
      setConversation(await importConversation(await file.text()))
    } catch (e) {
      notifyError(t('conv.importFailed'), t('conv.importInvalid', { reason: e instanceof Error ? e.message : String(e) }))
    }
  }

  if (!pane.open) return null
  return (
    <aside className="relative flex h-full shrink-0 flex-col border-r border-border bg-sidebar" style={{ width: pane.width }}>
      <div className="flex h-14 shrink-0 items-center gap-2.5 pr-3 pl-4">
        <img src="./favicon.svg" alt="" className="size-6" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">{t('app.name')}</span>
        <IconButton label={t('pane.listClose')} onClick={() => setPane('list', { open: false })}>
          <PanelLeftClose size={17} />
        </IconButton>
      </div>

      <div className="flex gap-2 px-3 pb-2">
        <button
          onClick={newChat}
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

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {conversations && conversations.length === 0 && (
          <div className="px-2 py-8 text-center text-[13px] text-faint">{t('sidebar.empty')}</div>
        )}
        <Group label={t('sidebar.today')} items={today} currentId={currentId} onSelect={setConversation} />
        <Group label={t('sidebar.earlier')} items={earlier} currentId={currentId} onSelect={setConversation} />
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <button
          onClick={() => openSettings()}
          className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
        >
          <Settings size={16} />
          {t('sidebar.settings')}
        </button>
      </div>

      <ResizeHandle
        label={t('pane.listResize')}
        edge="left"
        width={pane.width}
        min={PANE_MIN.list}
        max={PANE_MAX.list}
        onResize={(width) => setPane('list', { width })}
        onReset={() => setPane('list', { width: PANE_DEFAULT.list })}
        className="-right-1"
      />
    </aside>
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
    <div className="mt-3 first:mt-1">
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

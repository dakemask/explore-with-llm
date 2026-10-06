import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { db, type ChatNode, type Conversation, type Note } from '../../db'
import { useT } from '../../i18n'
import { deleteArchived, restoreArchived } from '../../lib/chat'
import { deleteNote, noteTitle, restoreNote } from '../../lib/notes'
import { sideFallbackTitle } from '../../lib/naming'
import { archivedItems, pathTo, subtreeIds, type ArchivedItem } from '../../lib/tree'
import { useSettings } from '../../store/settings'
import { Button, Tip } from '../ui/Button'
import { confirmDialog, Dialog } from '../ui/Dialog'

/** A conversation's archive: everything archived in it, newest first, to restore or delete forever. */
export function ArchiveDialog({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const nodes = useLiveQuery(
    () => (open ? db.nodes.where('conversationId').equals(conversation.id).toArray() : []),
    [open, conversation.id],
  )
  const notes = useLiveQuery(
    () => (open ? db.notes.where('conversationId').equals(conversation.id).toArray() : []),
    [open, conversation.id],
  )
  const items = useMemo(() => archivedItems(nodes ?? [], notes ?? []), [nodes, notes])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-xl"
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0">{t('archive.title')}</span>
          <span className="truncate text-[13px] font-normal text-faint">{conversation.title || t('conv.untitled')}</span>
        </span>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {nodes && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-[13px] text-faint">
            <Archive size={22} strokeWidth={1.5} />
            {t('archive.empty')}
          </div>
        ) : (
          <ul className="space-y-px">
            {items.map((item) => (
              <Row key={item.key} item={item} nodes={nodes ?? []} notes={notes ?? []} conversation={conversation} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

function Row({
  item,
  nodes,
  notes,
  conversation,
}: {
  item: ArchivedItem
  nodes: ChatNode[]
  notes: Note[]
  conversation: Conversation
}) {
  const t = useT()
  const lang = useSettings((s) => s.lang)

  const title = (() => {
    if (item.note) return noteTitle(item.note.text)
    if (item.kind !== 'side') return firstLine(item.nodes[0].user.text) || t('image.only')
    const root = item.nodes.find((n) => n.id === conversation.selectedChild[item.key]) ?? item.nodes[item.nodes.length - 1]
    return conversation.threadTitles?.[item.key] ?? (sideFallbackTitle(root, root.anchor?.text ?? '') || t('image.only'))
  })()
  const where = (() => {
    if (!item.parentId) return t('archive.atStart')
    const above = pathTo(nodes, item.parentId)
    const text = short(firstLine(above[above.length - 1]?.user.text ?? '') || t('image.only'))
    if (item.note) return t(item.note.target === 'user' ? 'archive.onUser' : 'archive.onReply', { n: above.length, text })
    return t(item.kind === 'side' ? 'archive.from' : 'archive.after', { n: above.length, text })
  })()
  const time = new Date(item.archived).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const ids = item.nodes.map((n) => n.id)

  const note = item.note
  const remove = async () => {
    const inside = note ? null : subtreeIds(nodes, ids)
    const m = inside ? notes.filter((n) => inside.has(n.nodeId)).length : 0
    const question = note
      ? t('archive.deleteNoteConfirm')
      : m
        ? t('archive.deleteConfirmNotes', { n: item.size, m })
        : t('archive.deleteConfirm', { n: item.size })
    if (!(await confirmDialog(question, { danger: true }))) return
    await (note ? deleteNote(note.id) : deleteArchived(conversation.id, ids))
  }

  const restore = (
    <Button
      size="sm"
      variant="ghost"
      aria-disabled={item.blocked}
      onClick={item.blocked ? undefined : () => void (note ? restoreNote(note.id) : restoreArchived(conversation.id, ids))}
      className={item.blocked ? 'cursor-default opacity-40 hover:bg-transparent hover:text-muted' : undefined}
    >
      <RotateCcw size={13} />
      {t('archive.restore')}
    </Button>
  )

  return (
    <li className="flex items-center gap-3 rounded-lg py-2.5 pr-2 pl-3 hover:bg-hover">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted">{t(`archive.kind.${item.kind}`)}</span>
          <span className="truncate text-[13px]">{title}</span>
        </div>
        <div className="mt-1 truncate text-xs text-faint">
          {[where, !note && (item.size === 1 ? t('archive.size1') : t('archive.size', { n: item.size })), time]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.blocked ? <Tip content={t('archive.blocked')}>{restore}</Tip> : restore}
        <Button size="sm" variant="ghost" onClick={remove} className="hover:bg-danger-soft! hover:text-danger!">
          <Trash2 size={13} />
          {t('archive.delete')}
        </Button>
      </div>
    </li>
  )
}

const firstLine = (text: string) =>
  text
    .split('\n')
    .find((l) => l.trim() && !l.trimStart().startsWith('>'))
    ?.trim() ?? ''

const short = (s: string) => (s.length > 18 ? s.slice(0, 18) + '…' : s)

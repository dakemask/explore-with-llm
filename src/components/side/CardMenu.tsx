import { Archive, MoreHorizontal, Pencil } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { ChatNode, Conversation } from '../../db'
import { useT } from '../../i18n'
import { renameThread } from '../../lib/chat'
import { busyIds, threadRoots } from '../../lib/tree'
import { IconButton, Tip } from '../ui/Button'
import { promptDialog } from '../ui/Dialog'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'

/** A card's ⋯ menu (expanded cards' headers, collapsed cards); `children` = its items. */
export function CardMenu({ children, className }: { children: ReactNode; className?: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <MenuRoot open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <IconButton label={t('msg.more')} size="sm" active={open} className={className}>
          <MoreHorizontal size={15} />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end">{children}</MenuContent>
    </MenuRoot>
  )
}

/** A side question's menu items: rename, archive (no confirm: reversible; not while it streams). */
export function SideMenuItems({
  conversation,
  thread,
  fallback,
  nodes,
  onArchive,
}: {
  conversation: Conversation
  thread: string
  fallback: string
  nodes: ChatNode[]
  onArchive: () => void
}) {
  const t = useT()
  const busy = useMemo(() => {
    const ids = busyIds(nodes)
    return threadRoots(nodes, thread).some((r) => ids.has(r.id))
  }, [nodes, thread])
  const rename = async () => {
    const title = await promptDialog(t('side.rename'), conversation.threadTitles?.[thread] ?? fallback)
    if (title?.trim()) await renameThread(conversation.id, thread, title.trim())
  }
  return (
    <>
      <MenuItem icon={<Pencil size={14} />} onSelect={() => void rename()}>
        {t('side.rename')}
      </MenuItem>
      {busy ? (
        <Tip content={t('archive.busy')}>
          <MenuItem icon={<Archive size={14} />} disabled onSelect={() => {}}>
            {t('msg.archive')}
          </MenuItem>
        </Tip>
      ) : (
        <MenuItem icon={<Archive size={14} />} onSelect={onArchive}>
          {t('msg.archive')}
        </MenuItem>
      )}
    </>
  )
}

/** A note's menu items: archive (no confirm: reversible). */
export function NoteMenuItems({ onArchive }: { onArchive: () => void }) {
  const t = useT()
  return (
    <MenuItem icon={<Archive size={14} />} onSelect={onArchive}>
      {t('msg.archive')}
    </MenuItem>
  )
}

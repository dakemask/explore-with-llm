import { Archive, GitBranch, MoreHorizontal, Pencil } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { ChatNode, Conversation } from '../../db'
import { useT } from '../../i18n'
import { renameThread } from '../../lib/chat'
import { busyIds, threadRoots } from '../../lib/tree'
import { useUi } from '../../store/ui'
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

/**
 * A side question's menu items: rename, turn into a branch (no confirm, though it can't be undone: owner;
 * not while it streams or is being named), archive (no confirm: reversible; not while it streams).
 */
export function SideMenuItems({
  conversation,
  thread,
  fallback,
  nodes,
  onConvert,
  onArchive,
}: {
  conversation: Conversation
  thread: string
  fallback: string
  nodes: ChatNode[]
  onConvert: () => void
  onArchive: () => void
}) {
  const t = useT()
  const busy = useMemo(() => {
    const ids = busyIds(nodes)
    return threadRoots(nodes, thread).some((r) => ids.has(r.id))
  }, [nodes, thread])
  // (A title arriving after the conversion would have no thread left to go to.)
  const naming = useUi((s) => !!s.naming[thread])
  const rename = async () => {
    const title = await promptDialog(t('side.rename'), conversation.threadTitles?.[thread] ?? fallback)
    if (title?.trim()) await renameThread(conversation.id, thread, title.trim())
  }
  return (
    <>
      <MenuItem icon={<Pencil size={14} />} onSelect={() => void rename()}>
        {t('side.rename')}
      </MenuItem>
      {busy || naming ? (
        <Tip content={t('side.toBranchBusy')}>
          <MenuItem icon={<GitBranch size={14} />} disabled onSelect={() => {}}>
            {t('side.toBranch')}
          </MenuItem>
        </Tip>
      ) : (
        <MenuItem icon={<GitBranch size={14} />} onSelect={onConvert}>
          {t('side.toBranch')}
        </MenuItem>
      )}
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

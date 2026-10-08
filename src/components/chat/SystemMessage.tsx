import { ScrollText } from 'lucide-react'
import { useT } from '../../i18n'

/**
 * The system message of a first turn (or of the one about to be sent), one line above it. Clicking opens its
 * editor: for a sent turn the message editor (a change makes a new attempt), else `SystemEditDialog`.
 */
export function SystemRow({ text, onClick }: { text: string | undefined; onClick?: () => void }) {
  const t = useT()
  const first = text?.split('\n').find((l) => l.trim())
  return (
    <button
      type="button"
      data-system-row
      onClick={onClick}
      disabled={!onClick}
      className="mb-4 flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg bg-subtle/60 px-3 text-left text-[13px] text-muted transition-colors enabled:hover:bg-subtle enabled:hover:text-text"
    >
      <ScrollText size={14} className="shrink-0" />
      <span className="shrink-0 font-medium">{t('system.title')}</span>
      <span className="min-w-0 truncate text-faint">{first ?? t('system.none')}</span>
    </button>
  )
}

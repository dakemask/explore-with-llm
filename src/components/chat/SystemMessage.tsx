import { ScrollText } from 'lucide-react'
import { useT } from '../../i18n'

/**
 * The system message of a first turn (or of the one about to be sent): a quiet centered line above the first
 * message, set apart from it. Clicking opens its editor: for a sent turn the message editor (a change
 * makes a new attempt), else `SystemEditDialog`.
 */
export function SystemRow({ text, onClick }: { text: string | undefined; onClick?: () => void }) {
  const t = useT()
  const first = text?.split('\n').find((l) => l.trim())
  return (
    // mb-3: set apart from the first message (with the turn's own spacing, 24 px).
    <div className="mb-3 flex justify-center">
      <button
        type="button"
        data-system-row
        onClick={onClick}
        disabled={!onClick}
        className="flex h-6 max-w-[85%] min-w-0 items-center gap-1 rounded-md px-1.5 text-xs text-faint transition-colors enabled:hover:bg-subtle enabled:hover:text-muted"
      >
        <ScrollText size={12} className="shrink-0" />
        <span className="shrink-0">{t('system.title')}</span>
        <span className="shrink-0">·</span>
        <span className="min-w-0 truncate">{first ?? t('system.none')}</span>
      </button>
    </div>
  )
}

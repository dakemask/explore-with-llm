import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Protocol } from '../../db'
import { useT } from '../../i18n'
import { presetTags, searchPresets, type ModelPreset } from '../../lib/presets'
import { Dialog } from '../ui/Dialog'

/** Built-in presets for the provider's protocol, with search and tag filters. Picking one applies it. */
export function PresetPicker({
  open,
  onOpenChange,
  protocol,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  protocol: Protocol
  onPick: (p: ModelPreset) => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const allTags = useMemo(() => presetTags(protocol), [protocol])
  const list = useMemo(() => searchPresets(protocol, query, tags), [protocol, query, tags])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTags([])
    }
  }, [open])

  const toggleTag = (tag: string) => setTags((s) => (s.includes(tag) ? s.filter((x) => x !== tag) : [...s, tag]))

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('preset.title')} className="h-[min(600px,80vh)] max-w-2xl" initialFocus="input">
      <div className="shrink-0 space-y-3 border-b border-border px-5 pt-4 pb-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('preset.search')}
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={clsx(
                  'h-6 rounded-full border px-2.5 text-xs transition-colors',
                  tags.includes(tag)
                    ? 'border-accent bg-accent-soft font-medium text-text'
                    : 'border-border text-muted hover:border-border-strong hover:text-text',
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        <div className="text-xs text-faint">{t('preset.scope', { protocol: t(`protocol.${protocol}`), n: list.length })}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-faint">
            {allTags.length === 0 ? t('preset.noneForProtocol') : t('preset.noMatch')}
          </div>
        ) : (
          <ul className="space-y-px">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onPick(p)}
                  className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13.5px] font-medium">{p.label}</span>
                      <span className="text-xs text-faint">{t('preset.official', { vendor: p.vendor })}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-muted">{p.model}</div>
                    {p.notes && <div className="mt-1 text-xs leading-relaxed text-faint">{p.notes}</div>}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1 pt-0.5">
                    {p.tags.map((tag) => (
                      <span key={tag} className="rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

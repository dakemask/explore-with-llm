import { Check, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Provider } from '../../db'
import { useT } from '../../i18n'
import { addModels } from '../../lib/models'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

/** Fetching this many models (or more) opens this picker instead of adding them all. */
export const PICK_THRESHOLD = 12

/**
 * Every model one fetch returned, each with an add button. Models the provider already has (or that were
 * just added) are greyed out. `provider` is the live stored record.
 */
export function FetchedModels({
  open,
  onOpenChange,
  provider,
  models,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: Provider
  models: string[]
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const list = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return models.filter((m) => words.every((w) => m.toLowerCase().includes(w)))
  }, [models, query])
  const have = models.filter((m) => provider.models.includes(m)).length

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('fetched.title')} className="h-[min(600px,80vh)] max-w-lg" initialFocus="input">
      <div className="shrink-0 space-y-2.5 border-b border-border px-5 pt-4 pb-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('fetched.search')}
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
          />
        </div>
        <div className="text-xs text-faint">{t('fetched.count', { n: models.length, have })}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-faint">{t('fetched.noMatch')}</div>
        ) : (
          <ul className="space-y-px">
            {list.map((m) => {
              const added = provider.models.includes(m)
              return (
                <li key={m} className="flex items-center gap-3 rounded-lg py-1.5 pr-1.5 pl-3 hover:bg-hover">
                  <span className={added ? 'min-w-0 flex-1 truncate font-mono text-[13px] text-faint' : 'min-w-0 flex-1 truncate font-mono text-[13px]'}>
                    {m}
                  </span>
                  <Button size="sm" variant="ghost" disabled={added} onClick={() => addModels(provider, [m])}>
                    {added ? <Check size={13} /> : <Plus size={13} />}
                    {added ? t('fetched.added') : t('fetched.add')}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

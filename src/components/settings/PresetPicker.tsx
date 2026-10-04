import clsx from 'clsx'
import { Search } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Protocol } from '../../db'
import { useT } from '../../i18n'
import { allPresetTags, searchPresets, tagsOf, type ModelPreset, type PresetTag } from '../../lib/presets'
import { Dialog } from '../ui/Dialog'

/**
 * Every built-in preset, filtered by search and tags (channel / series / protocol). Presets for another
 * protocol than the provider's are shown greyed out and can't be picked. Picking one applies it.
 */
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
  const [selected, setSelected] = useState<PresetTag[]>([])
  const allTags = useMemo(() => allPresetTags(), [])
  // Usable ones first; sort is stable, so each half keeps the data order.
  const list = useMemo(
    () => searchPresets(query, selected).sort((a, b) => +(b.protocol === protocol) - +(a.protocol === protocol)),
    [protocol, query, selected],
  )
  const usable = list.filter((p) => p.protocol === protocol).length

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected([])
    }
  }, [open])

  const isOn = (tag: PresetTag) => selected.some((s) => s.group === tag.group && s.value === tag.value)
  const toggle = (tag: PresetTag) =>
    setSelected((s) => (isOn(tag) ? s.filter((x) => x.group !== tag.group || x.value !== tag.value) : [...s, tag]))
  const tagLabel = (tag: PresetTag) =>
    tag.group === 'channel'
      ? t('preset.official')
      : tag.group === 'protocol'
        ? t(`protocol.${tag.value as Protocol}`)
        : tag.value

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('preset.title')} className="h-[min(640px,80vh)] max-w-2xl" initialFocus="input">
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
        <div className="flex flex-wrap items-center gap-1.5">
          {allTags.map((tag, i) => (
            <Fragment key={tag.group + tag.value}>
              {i > 0 && allTags[i - 1].group !== tag.group && <span className="mx-1 h-4 w-px bg-border" />}
              <button
                onClick={() => toggle(tag)}
                className={clsx(
                  'h-6 rounded-full border px-2.5 text-xs transition-colors',
                  isOn(tag)
                    ? 'border-accent bg-accent-soft font-medium text-text'
                    : 'border-border text-muted hover:border-border-strong hover:text-text',
                )}
              >
                {tagLabel(tag)}
              </button>
            </Fragment>
          ))}
        </div>
        <div className="text-xs text-faint">
          {t('preset.scope', { n: list.length, usable, protocol: t(`protocol.${protocol}`) })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-faint">
            {t('preset.noMatch')}
          </div>
        ) : (
          <ul className="space-y-px">
            {list.map((p) => {
              const ok = p.protocol === protocol
              return (
                <li key={p.id}>
                  <button
                    onClick={() => onPick(p)}
                    disabled={!ok}
                    title={ok ? undefined : t('preset.otherProtocol', { protocol: t(`protocol.${p.protocol}`) })}
                    className="w-full rounded-lg px-3 py-2.5 text-left transition-colors enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="mr-1 text-[13.5px] font-medium">{p.label}</span>
                      {tagsOf(p).map((tag) => (
                        <span
                          key={tag.group}
                          className={clsx(
                            'rounded px-1.5 py-0.5 text-[11px]',
                            tag.group === 'protocol' && ok ? 'bg-accent-soft text-text' : 'bg-subtle text-muted',
                          )}
                        >
                          {tagLabel(tag)}
                        </span>
                      ))}
                    </div>
                    {p.notes && <div className="mt-1 text-xs leading-relaxed text-faint">{p.notes}</div>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

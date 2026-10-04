import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { db, type Provider } from '../../db'
import { useT } from '../../i18n'
import { useSettings } from '../../store/settings'
import { useUi } from '../../store/ui'
import { MenuContent, MenuItem, MenuLabel, MenuRoot, MenuSeparator, MenuTrigger } from '../ui/Menu'

/** Resolves the provider/model to use, falling back to the first available one. */
export function useCurrentModel(): { providers: Provider[] | undefined; provider?: Provider; model?: string } {
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray(), [])
  const { providerId, model } = useSettings()
  if (!providers) return { providers }
  const usable = providers.filter((p) => p.models.length > 0)
  const provider = usable.find((p) => p.id === providerId) ?? usable[0]
  if (!provider) return { providers }
  return { providers, provider, model: provider.models.includes(model ?? '') ? model! : provider.models[0] }
}

export function ModelPicker() {
  const t = useT()
  const { providers, provider, model } = useCurrentModel()
  const setModel = useSettings((s) => s.setModel)
  const openSettings = useUi((s) => s.openSettings)
  if (!providers) return null

  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <button className="flex h-8 max-w-72 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-hover data-[state=open]:bg-hover">
          <span className="truncate">{model ?? t('chat.selectModel')}</span>
          {provider && <span className="truncate font-normal text-faint">{provider.name}</span>}
          <ChevronDown size={14} className="shrink-0 text-faint" />
        </button>
      </MenuTrigger>
      <MenuContent className="w-72">
        {providers.map((p) => (
          <div key={p.id}>
            <MenuLabel>{p.name}</MenuLabel>
            {p.models.length === 0 && <div className="px-2 py-1.5 text-xs text-faint">{t('chat.noModels')}</div>}
            {p.models.map((m) => {
              const selected = p.id === provider?.id && m === model
              return (
                <MenuItem
                  key={m}
                  selected={selected}
                  icon={<Check size={14} className={clsx(!selected && 'invisible')} />}
                  onSelect={() => setModel(p.id, m)}
                >
                  {m}
                </MenuItem>
              )
            })}
          </div>
        ))}
        {providers.length > 0 && <MenuSeparator />}
        <MenuItem icon={<Plus size={14} />} onSelect={() => openSettings('providers')}>
          {t('chat.addProvider')}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  )
}

import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronDown, Globe, Plug, Plus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { nanoid } from 'nanoid'
import { db, type Provider } from '../../db'
import { useT, type Lang } from '../../i18n'
import { namingParamKey, useSettings, type Theme } from '../../store/settings'
import { ParamsControl } from '../chat/ParamsControl'
import { useUi } from '../../store/ui'
import { Dialog } from '../ui/Dialog'
import { Label, Segmented, Textarea } from '../ui/Field'
import { MenuContent, MenuItem, MenuLabel, MenuRoot, MenuSeparator, MenuTrigger } from '../ui/Menu'
import { ProviderForm } from './ProviderForm'

export function SettingsDialog() {
  const t = useT()
  const open = useUi((s) => s.settingsOpen)
  const tab = useUi((s) => s.settingsTab)
  const close = useUi((s) => s.closeSettings)
  const openTab = useUi((s) => s.openSettings)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t('settings.title')}
      className="h-[min(640px,85vh)] max-w-4xl max-sm:h-[90vh]"
    >
      <div className="flex min-h-0 flex-1 max-sm:flex-col">
        <nav className="w-44 shrink-0 space-y-px border-r border-border p-2 max-sm:flex max-sm:w-auto max-sm:gap-1 max-sm:space-y-0 max-sm:border-r-0 max-sm:border-b">
          <TabButton active={tab === 'providers'} onClick={() => openTab('providers')} icon={<Plug size={15} />}>
            {t('settings.providers')}
          </TabButton>
          <TabButton active={tab === 'general'} onClick={() => openTab('general')} icon={<Globe size={15} />}>
            {t('settings.general')}
          </TabButton>
        </nav>
        <div className="min-h-0 min-w-0 flex-1">{tab === 'providers' ? <ProvidersTab /> : <GeneralTab />}</div>
      </div>
    </Dialog>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors',
        active ? 'bg-active font-medium text-text' : 'text-muted hover:bg-hover hover:text-text',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function ProvidersTab() {
  const t = useT()
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray(), [])
  // Opened for a specific provider/model (e.g. from the composer's parameter button).
  const focus = useUi((s) => s.settingsFocus)
  const [selectedId, setSelectedId] = useState<string | null>(focus?.providerId ?? null)

  // Keep a valid selection as providers are added / removed.
  useEffect(() => {
    if (!providers) return
    if (!selectedId || !providers.some((p) => p.id === selectedId)) setSelectedId(providers[0]?.id ?? null)
  }, [providers, selectedId])

  const selected = providers?.find((p) => p.id === selectedId)

  const add = async () => {
    const p: Provider = {
      id: nanoid(),
      name: '',
      protocol: 'openai-chat',
      baseUrl: '',
      apiKey: '',
      models: [],
      createdAt: Date.now(),
    }
    await db.providers.add(p)
    setSelectedId(p.id)
  }

  return (
    <div className="flex h-full max-sm:flex-col">
      <div className="flex w-52 shrink-0 flex-col border-r border-border max-sm:max-h-40 max-sm:w-auto max-sm:border-r-0 max-sm:border-b">
        <ul className="min-h-0 flex-1 space-y-px overflow-y-auto p-2">
          {providers?.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedId(p.id)}
                className={clsx(
                  'flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left transition-colors',
                  p.id === selectedId ? 'bg-active' : 'hover:bg-hover',
                )}
              >
                <span className="w-full truncate text-[13px] font-medium">{p.name || '—'}</span>
                <span className="w-full truncate text-[11px] text-faint">{t(`protocol.${p.protocol}`)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border p-2">
          <button
            onClick={add}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
          >
            <Plus size={14} />
            {t('provider.add')}
          </button>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <ProviderForm
            key={selected.id}
            provider={selected}
            initialModel={focus?.providerId === selected.id ? focus.model : undefined}
          />
        ) : (
          providers && (
            <div className="flex h-full items-center justify-center text-[13px] text-faint">{t('provider.empty')}</div>
          )
        )}
      </div>
    </div>
  )
}

function GeneralTab() {
  const t = useT()
  const { lang, theme, setLang, setTheme, systemPrompt, setSystemPrompt } = useSettings()
  return (
    <div className="space-y-6 p-6">
      <div>
        <Label>{t('settings.language')}</Label>
        <Segmented<Lang>
          value={lang}
          onChange={setLang}
          options={[
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
          ]}
        />
      </div>
      <div>
        <Label>{t('settings.theme')}</Label>
        <Segmented<Theme>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: t('settings.theme.system') },
            { value: 'light', label: t('settings.theme.light') },
            { value: 'dark', label: t('settings.theme.dark') },
          ]}
        />
      </div>
      <div>
        <Label help={t('settings.naming.help')}>{t('settings.naming')}</Label>
        <NamingModelPicker />
      </div>
      <div>
        <Label hint={t('settings.system.hint')}>{t('settings.system')}</Label>
        <Textarea rows={3} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      </div>
    </div>
  )
}

/** Chooses the model that names conversations and side questions, or none. */
function NamingModelPicker() {
  const t = useT()
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray(), [])
  const { namingModel, setNamingModel } = useSettings()
  const provider = namingModel && providers?.find((p) => p.id === namingModel.providerId)
  const missing = !!providers && !!namingModel && !provider?.models.includes(namingModel.model)
  const check = (on: boolean) => <Check size={14} className={clsx(!on && 'invisible')} />
  return (
    <div>
      <div className="flex items-center gap-2">
        <MenuRoot>
          <MenuTrigger asChild>
            <button className="flex h-9 w-72 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-left text-sm transition-colors hover:border-border-strong data-[state=open]:border-accent">
              {namingModel ? (
                <>
                  <span className="truncate">{namingModel.model}</span>
                  {provider && <span className="truncate text-faint">{provider.name}</span>}
                </>
              ) : (
                <span className="text-muted">{t('settings.naming.off')}</span>
              )}
              <ChevronDown size={14} className="ml-auto shrink-0 text-faint" />
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="w-72">
            <MenuItem selected={!namingModel} icon={check(!namingModel)} onSelect={() => setNamingModel(null)}>
              {t('settings.naming.off')}
            </MenuItem>
            {providers?.some((p) => p.models.length > 0) && <MenuSeparator />}
            {providers
              ?.filter((p) => p.models.length > 0)
              .map((p) => (
                <div key={p.id}>
                  <MenuLabel>{p.name}</MenuLabel>
                  {p.models.map((m) => {
                    const on = namingModel?.providerId === p.id && namingModel.model === m
                    return (
                      <MenuItem key={m} selected={on} icon={check(on)} onSelect={() => setNamingModel({ providerId: p.id, model: m })}>
                        {m}
                      </MenuItem>
                    )
                  })}
                </div>
              ))}
          </MenuContent>
        </MenuRoot>
        {provider && !missing && (
          <ParamsControl provider={provider} model={namingModel.model} choiceKey={namingParamKey(provider.id, namingModel.model)} />
        )}
      </div>
      {missing && <div className="mt-1.5 text-xs text-danger">{t('settings.naming.missing')}</div>}
    </div>
  )
}

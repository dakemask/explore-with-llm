import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Globe, Plug, Plus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../../db'
import { useT, type Lang } from '../../i18n'
import { useSettings, type Theme } from '../../store/settings'
import { useUi } from '../../store/ui'
import { Dialog } from '../ui/Dialog'
import { Label, Segmented } from '../ui/Field'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'
import { ProviderForm } from './ProviderForm'
import { createProvider, PRESETS } from './presets'

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
      className="h-[min(640px,85vh)] max-w-4xl"
    >
      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 space-y-px border-r border-border p-2">
          <TabButton active={tab === 'providers'} onClick={() => openTab('providers')} icon={<Plug size={15} />}>
            {t('settings.providers')}
          </TabButton>
          <TabButton active={tab === 'general'} onClick={() => openTab('general')} icon={<Globe size={15} />}>
            {t('settings.general')}
          </TabButton>
        </nav>
        <div className="min-w-0 flex-1">{tab === 'providers' ? <ProvidersTab /> : <GeneralTab />}</div>
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
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Keep a valid selection as providers are added / removed.
  useEffect(() => {
    if (!providers) return
    if (!selectedId || !providers.some((p) => p.id === selectedId)) setSelectedId(providers[0]?.id ?? null)
  }, [providers, selectedId])

  const selected = providers?.find((p) => p.id === selectedId)

  const add = async (presetId: string) => {
    const p = createProvider(presetId)
    await db.providers.add(p)
    setSelectedId(p.id)
  }

  return (
    <div className="flex h-full">
      <div className="flex w-52 shrink-0 flex-col border-r border-border">
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
          <MenuRoot>
            <MenuTrigger asChild>
              <button className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong text-[13px] text-muted transition-colors hover:bg-hover hover:text-text">
                <Plus size={14} />
                {t('provider.add')}
              </button>
            </MenuTrigger>
            <MenuContent className="w-48">
              {PRESETS.map((p) => (
                <MenuItem key={p.id} onSelect={() => add(p.id)}>
                  {p.id === 'custom' ? t('provider.custom') : p.name}
                </MenuItem>
              ))}
            </MenuContent>
          </MenuRoot>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <ProviderForm key={selected.id} provider={selected} />
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
  const { lang, theme, setLang, setTheme } = useSettings()
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
    </div>
  )
}

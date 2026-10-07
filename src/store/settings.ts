import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '../i18n'
import { PANE_DEFAULT } from '../lib/panes'
import type { ParamChoice } from '../lib/params'

export type Theme = 'system' | 'light' | 'dark'
export type Pane = 'list' | 'column'

interface SettingsState {
  lang: Lang
  theme: Theme
  /** Last used provider/model, used as the default for new messages. */
  providerId: string | null
  model: string | null
  /**
   * Parameter choices last made for each model, keyed by `paramKey(providerId, model)` (chat) or
   * `namingParamKey(providerId, model)` (the same model used for naming), then parameter name.
   */
  paramChoices: Record<string, Record<string, ParamChoice>>
  /** Model that names conversations and side questions (`lib/naming.ts`); null = no automatic naming. */
  namingModel: { providerId: string; model: string } | null
  /** The conversation list (left) and the side-question column (right): open, and width in px (`lib/panes.ts`). */
  panes: Record<Pane, { open: boolean; width: number }>
  setPane: (pane: Pane, patch: Partial<{ open: boolean; width: number }>) => void
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setModel: (providerId: string, model: string) => void
  setParamChoice: (key: string, name: string, choice: ParamChoice) => void
  setNamingModel: (m: { providerId: string; model: string } | null) => void
  /** A model was renamed in settings: keep it selected and keep its parameter choices. */
  renameModel: (providerId: string, from: string, to: string) => void
}

export const paramKey = (providerId: string, model: string) => `${providerId}/${model}`
/** Naming keeps its own choices: a title needs far less (e.g. reasoning effort) than a chat reply. */
export const namingParamKey = (providerId: string, model: string) => `naming:${providerId}/${model}`

const defaultLang: Lang = typeof navigator !== 'undefined' && !navigator.language.startsWith('zh') ? 'en' : 'zh'

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: defaultLang,
      theme: 'system',
      providerId: null,
      model: null,
      paramChoices: {},
      namingModel: null,
      panes: { list: { open: true, width: PANE_DEFAULT.list }, column: { open: true, width: PANE_DEFAULT.column } },
      setPane: (pane, patch) => set((s) => ({ panes: { ...s.panes, [pane]: { ...s.panes[pane], ...patch } } })),
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setModel: (providerId, model) => set({ providerId, model }),
      setNamingModel: (namingModel) => set({ namingModel }),
      setParamChoice: (key, name, choice) =>
        set((s) => {
          const forModel = s.paramChoices[key] ?? {}
          return { paramChoices: { ...s.paramChoices, [key]: { ...forModel, [name]: { ...forModel[name], ...choice } } } }
        }),
      renameModel: (providerId, from, to) =>
        set((s) => {
          const paramChoices = { ...s.paramChoices }
          for (const key of [paramKey, namingParamKey]) {
            const old = key(providerId, from)
            if (paramChoices[old]) paramChoices[key(providerId, to)] = paramChoices[old]
            delete paramChoices[old]
          }
          const selected = s.providerId === providerId && s.model === from
          const naming = s.namingModel?.providerId === providerId && s.namingModel.model === from
          return { paramChoices, ...(selected && { model: to }), ...(naming && { namingModel: { providerId, model: to } }) }
        }),
    }),
    { name: 'ewl-settings' },
  ),
)

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '../i18n'
import { PANE_DEFAULT } from '../lib/panes'
import type { ParamChoice } from '../lib/params'

export type Theme = 'system' | 'light' | 'dark'
export type Pane = 'column'

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
  /** The system message new conversations start from (empty: none is sent). */
  systemPrompt: string
  /** The side-question column: open, and width in px (`lib/panes.ts`). */
  panes: Record<Pane, { open: boolean; width: number }>
  setPane: (pane: Pane, patch: Partial<{ open: boolean; width: number }>) => void
  /** The tree map window's place and size in px (viewport); null = not moved yet (opens top right). */
  treeWindow: TreeWindow | null
  setTreeWindow: (box: TreeWindow) => void
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setModel: (providerId: string, model: string) => void
  setParamChoice: (key: string, name: string, choice: ParamChoice) => void
  setNamingModel: (m: { providerId: string; model: string } | null) => void
  setSystemPrompt: (text: string) => void
  /** A model was renamed in settings: keep it selected and keep its parameter choices. */
  renameModel: (providerId: string, from: string, to: string) => void
}

export interface TreeWindow {
  x: number
  y: number
  w: number
  h: number
}

export const paramKey = (providerId: string, model: string) => `${providerId}/${model}`
/** Naming keeps its own choices: a title needs far less (e.g. reasoning effort) than a chat reply. */
export const namingParamKey = (providerId: string, model: string) => `naming:${providerId}/${model}`

export const DEFAULT_SYSTEM = 'You are a helpful assistant.'

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
      systemPrompt: DEFAULT_SYSTEM,
      panes: { column: { open: true, width: PANE_DEFAULT.column } },
      setPane: (pane, patch) => set((s) => ({ panes: { ...s.panes, [pane]: { ...s.panes[pane], ...patch } } })),
      treeWindow: null,
      setTreeWindow: (treeWindow) => set({ treeWindow }),
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setModel: (providerId, model) => set({ providerId, model }),
      setNamingModel: (namingModel) => set({ namingModel }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
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

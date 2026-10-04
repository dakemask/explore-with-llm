import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '../i18n'
import type { ParamChoice } from '../lib/params'

export type Theme = 'system' | 'light' | 'dark'

interface SettingsState {
  lang: Lang
  theme: Theme
  /** Last used provider/model, used as the default for new messages. */
  providerId: string | null
  model: string | null
  /** Parameter choices last made for each model, keyed by `paramKey(providerId, model)`, then parameter name. */
  paramChoices: Record<string, Record<string, ParamChoice>>
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setModel: (providerId: string, model: string) => void
  setParamChoice: (key: string, name: string, choice: ParamChoice) => void
}

export const paramKey = (providerId: string, model: string) => `${providerId}/${model}`

const defaultLang: Lang = typeof navigator !== 'undefined' && !navigator.language.startsWith('zh') ? 'en' : 'zh'

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: defaultLang,
      theme: 'system',
      providerId: null,
      model: null,
      paramChoices: {},
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setModel: (providerId, model) => set({ providerId, model }),
      setParamChoice: (key, name, choice) =>
        set((s) => {
          const forModel = s.paramChoices[key] ?? {}
          return { paramChoices: { ...s.paramChoices, [key]: { ...forModel, [name]: { ...forModel[name], ...choice } } } }
        }),
    }),
    { name: 'ewl-settings' },
  ),
)

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

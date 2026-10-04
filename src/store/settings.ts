import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '../i18n'

export type Theme = 'system' | 'light' | 'dark'

interface SettingsState {
  lang: Lang
  theme: Theme
  /** Last used provider/model, used as the default for new messages. */
  providerId: string | null
  model: string | null
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setModel: (providerId: string, model: string) => void
}

const defaultLang: Lang = typeof navigator !== 'undefined' && !navigator.language.startsWith('zh') ? 'en' : 'zh'

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: defaultLang,
      theme: 'system',
      providerId: null,
      model: null,
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setModel: (providerId, model) => set({ providerId, model }),
    }),
    { name: 'ewl-settings' },
  ),
)

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

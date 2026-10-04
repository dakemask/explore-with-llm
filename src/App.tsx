import * as Tooltip from '@radix-ui/react-tooltip'
import { useEffect } from 'react'
import { ChatView } from './components/chat/ChatView'
import { Sidebar } from './components/layout/Sidebar'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { DialogHost } from './components/ui/Dialog'
import { applyTheme, useSettings } from './store/settings'

export function App() {
  const theme = useSettings((s) => s.theme)
  const lang = useSettings((s) => s.lang)

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="flex h-full">
        <Sidebar />
        <ChatView />
      </div>
      <SettingsDialog />
      <DialogHost />
    </Tooltip.Provider>
  )
}

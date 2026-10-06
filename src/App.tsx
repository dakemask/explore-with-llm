import * as Tooltip from '@radix-ui/react-tooltip'
import { useEffect } from 'react'
import { ChatView } from './components/chat/ChatView'
import { DetailDialog } from './components/detail/DetailDialog'
import { Sidebar } from './components/layout/Sidebar'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { DialogHost } from './components/ui/Dialog'
import { ToastHost } from './components/ui/Toast'
import { applyTheme, useSettings } from './store/settings'
import { useUi } from './store/ui'

export function App() {
  const theme = useSettings((s) => s.theme)
  const lang = useSettings((s) => s.lang)
  const panel = useUi((s) => s.panel)

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
      {/* overflow-hidden: anything animating past the right edge would make Windows show a horizontal
          scrollbar for a moment and the whole page jump. */}
      <div className="flex h-full overflow-hidden">
        <Sidebar />
        <ChatView />
      </div>
      {panel && <DetailDialog key={panel.nodeId} nodeId={panel.nodeId} />}
      <SettingsDialog />
      <DialogHost />
      <ToastHost />
    </Tooltip.Provider>
  )
}

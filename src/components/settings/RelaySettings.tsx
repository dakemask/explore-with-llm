import { Check, Download, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { RelayError, testRelay } from '../../lib/relay'
import { relayFile } from '../../lib/relayDownload'
import { download } from '../../lib/transfer'
import { useSettings } from '../../store/settings'
import { Button, IconButton } from '../ui/Button'
import { Input, Label } from '../ui/Field'
import { notifyError } from '../ui/Toast'

export function RelaySettings() {
  const t = useT()
  const { relayUrl, relayPassword, setRelay } = useSettings()
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok'>('idle')
  const pending = useRef<AbortController | null>(null)
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    setStatus('idle')
    return () => { pending.current?.abort(); pending.current = null; clearTimeout(doneTimer.current) }
  }, [relayUrl, relayPassword])

  const saveFile = async (kind: 'cloudflare' | 'node') => {
    try {
      const file = await relayFile(kind, relayPassword)
      download(file.name, file.blob)
    } catch (error) {
      notifyError(t('relay.downloadFailed'), (error as Error).message)
    }
  }
  const test = async () => {
    const controller = new AbortController()
    pending.current?.abort()
    pending.current = controller
    clearTimeout(doneTimer.current)
    setStatus('testing')
    const timer = setTimeout(() => controller.abort('timeout'), 15000)
    try {
      await testRelay(relayUrl, relayPassword, controller.signal)
      if (pending.current === controller && !controller.signal.aborted) {
        setStatus('ok')
        doneTimer.current = setTimeout(() => setStatus('idle'), 1500)
      }
    } catch (error) {
      if (pending.current !== controller || (controller.signal.aborted && controller.signal.reason !== 'timeout')) return
      setStatus('idle')
      const message = error instanceof RelayError ? t(`relay.${error.key}`) : (error as Error).message
      notifyError(t('relay.testFailed'), controller.signal.reason === 'timeout' ? t('relay.timeout') : message)
    } finally {
      clearTimeout(timer)
      if (pending.current === controller) pending.current = null
    }
  }

  return (
    <div className="h-full space-y-5 overflow-y-auto p-6">
      <div>
        <Label help={t('relay.urlHint')}>{t('relay.url')}</Label>
        <Input aria-label={t('relay.url')} value={relayUrl} onChange={(e) => setRelay({ relayUrl: e.target.value })}
          placeholder="https://your-relay.pages.dev" spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
      </div>
      <div>
        <Label>{t('relay.password')}</Label>
        <div className="relative">
          <Input aria-label={t('relay.password')} type={show ? 'text' : 'password'} value={relayPassword}
            onChange={(e) => setRelay({ relayPassword: e.target.value })} autoComplete="off" spellCheck={false}
            className="pr-10 font-mono text-[13px]" />
          <div className="absolute top-1/2 right-1 -translate-y-1/2">
            <IconButton label={t(show ? 'relay.hide' : 'relay.show')} size="sm" onClick={() => setShow(!show)}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </IconButton>
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-faint">{t('relay.passwordHint')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={test} disabled={!relayUrl.trim() || !relayPassword.trim() || status === 'testing'}>
          {status === 'testing' ? <Loader2 size={14} className="animate-spin" /> : status === 'ok' ? <Check size={14} /> : null}
          {t(status === 'testing' ? 'relay.testing' : status === 'ok' ? 'relay.connected' : 'relay.test')}
        </Button>
      </div>
      <div className="space-y-3 border-t border-border pt-5">
        <Label help={<div className="space-y-2"><p>{t('relay.cloudflareHelp')}</p><p>{t('relay.nodeHelp')}</p></div>}>
          {t('relay.download')}
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!relayPassword.trim()} onClick={() => saveFile('cloudflare')}>
            <Download size={14} />Cloudflare ZIP
          </Button>
          <Button size="sm" disabled={!relayPassword.trim()} onClick={() => saveFile('node')}>
            <Download size={14} />Node.js
          </Button>
        </div>
      </div>
    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Download, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { db } from '../../db'
import { useT } from '../../i18n'
import { testRelay } from '../../lib/relay'
import { relayFile, relayTargets } from '../../lib/relayDownload'
import { download } from '../../lib/transfer'
import { useSettings } from '../../store/settings'
import { Button, IconButton } from '../ui/Button'
import { Input, Label } from '../ui/Field'
import { notifyError } from '../ui/Toast'

export function RelaySettings() {
  const t = useT()
  const { relayUrl, relayPassword, setRelay } = useSettings()
  const providers = useLiveQuery(() => db.providers.toArray(), [])
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok'>('idle')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => {
    setStatus('idle')
    return () => { pending.current?.abort(); pending.current = null }
  }, [relayUrl, relayPassword])

  const saveFile = async (kind: 'cloudflare' | 'node') => {
    try {
      const targets = relayTargets(providers ?? [])
      if (!targets.length) throw new Error(t('relay.targetsMissing'))
      const file = await relayFile(kind, relayPassword, location.origin, targets)
      download(file.name, file.blob)
    } catch (error) {
      notifyError(t('relay.downloadFailed'), (error as Error).message)
    }
  }
  const test = async () => {
    const controller = new AbortController()
    pending.current?.abort()
    pending.current = controller
    setStatus('testing')
    const timer = setTimeout(() => controller.abort('timeout'), 15000)
    try {
      await testRelay(relayUrl, relayPassword, controller.signal)
      if (pending.current === controller && !controller.signal.aborted) setStatus('ok')
    } catch (error) {
      if (pending.current !== controller || (controller.signal.aborted && controller.signal.reason !== 'timeout')) return
      setStatus('idle')
      notifyError(t('relay.testFailed'), controller.signal.reason === 'timeout' ? t('relay.timeout') : (error as Error).message)
    } finally {
      clearTimeout(timer)
      if (pending.current === controller) pending.current = null
    }
  }

  return (
    <div className="h-full space-y-5 overflow-y-auto p-6">
      <p className="text-[13px] leading-relaxed text-muted">{t('relay.description')}</p>
      <div>
        <Label>{t('relay.url')}</Label>
        <Input aria-label={t('relay.url')} value={relayUrl} onChange={(e) => setRelay({ relayUrl: e.target.value })}
          placeholder="https://your-relay.pages.dev" spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
        <p className="mt-1.5 text-xs text-faint">{t('relay.urlHint')}</p>
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
          {t(status === 'testing' ? 'relay.testing' : 'relay.test')}
        </Button>
        {status === 'ok' && <span role="status" className="text-xs text-muted">{t('relay.connected')}</span>}
      </div>
      <div className="space-y-3 border-t border-border pt-5">
        <Label>{t('relay.download')}</Label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!relayPassword.trim() || !providers} onClick={() => saveFile('cloudflare')}>
            <Download size={14} />Cloudflare ZIP
          </Button>
          <Button size="sm" disabled={!relayPassword.trim() || !providers} onClick={() => saveFile('node')}>
            <Download size={14} />Node.js
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-faint">{t('relay.downloadHint')}</p>
        <details className="text-xs leading-relaxed text-muted">
          <summary className="cursor-pointer text-text">{t('relay.instructions')}</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>{t('relay.cloudflareHelp')}</li>
            <li>{t('relay.nodeHelp')}</li>
          </ol>
        </details>
      </div>
    </div>
  )
}

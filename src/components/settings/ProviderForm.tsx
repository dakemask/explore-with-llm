import clsx from 'clsx'
import { Eye, EyeOff, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db, type Provider } from '../../db'
import { useT } from '../../i18n'
import { getAdapter, PROTOCOLS, ProviderError } from '../../providers'
import { Button } from '../ui/Button'
import { confirmDialog } from '../ui/Dialog'
import { Input, Label, Textarea } from '../ui/Field'

/** Edits a provider in place; every change is saved immediately. */
export function ProviderForm({ provider: initial }: { provider: Provider }) {
  const t = useT()
  // Local copy so inputs stay responsive; IndexedDB writes are async.
  const [provider, setProvider] = useState(initial)
  const [showKey, setShowKey] = useState(false)
  const [modelsText, setModelsText] = useState(provider.models.join('\n'))
  const [fetchState, setFetchState] = useState<{ loading?: boolean; message?: string; error?: boolean }>({})

  const save = (patch: Partial<Provider>) => {
    setProvider((p) => ({ ...p, ...patch }))
    db.providers.update(provider.id, patch)
  }

  const setModels = (text: string) => {
    setModelsText(text)
    const models = [...new Set(text.split('\n').map((s) => s.trim()).filter(Boolean))]
    save({ models })
  }

  const fetchModels = async () => {
    setFetchState({ loading: true })
    try {
      const models = await getAdapter(provider.protocol).listModels(provider)
      if (models.length === 0) throw new ProviderError('Empty model list')
      setModels(models.join('\n'))
      setFetchState({ message: t('provider.fetched', { n: models.length }) })
    } catch (e) {
      const err = e as ProviderError
      setFetchState({ error: true, message: err.code === 'network' ? t('error.network') : err.message })
    }
  }

  const remove = async () => {
    if (await confirmDialog(t('provider.deleteConfirm'), { danger: true })) await db.providers.delete(provider.id)
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <Label>{t('provider.name')}</Label>
        <Input value={provider.name} onChange={(e) => save({ name: e.target.value })} placeholder="DeepSeek" />
      </div>

      <div>
        <Label>{t('provider.protocol')}</Label>
        <div className="grid grid-cols-3 gap-2">
          {PROTOCOLS.map((p) => (
            <button
              key={p.id}
              disabled={!p.available}
              onClick={() => save({ protocol: p.id })}
              className={clsx(
                'rounded-lg border px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed',
                provider.protocol === p.id
                  ? 'border-accent bg-accent-soft font-medium text-text'
                  : 'border-border text-muted enabled:hover:border-border-strong enabled:hover:text-text',
                !p.available && 'opacity-50',
              )}
            >
              <div>{t(`protocol.${p.id}`)}</div>
              {!p.available && <div className="mt-0.5 text-[11px] text-faint">{t('provider.comingSoon')}</div>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>{t('provider.baseUrl')}</Label>
        <Input
          value={provider.baseUrl}
          onChange={(e) => save({ baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          spellCheck={false}
          className="font-mono text-[13px]"
        />
      </div>

      <div>
        <Label>{t('provider.apiKey')}</Label>
        <div className="relative">
          <Input
            type={showKey ? 'text' : 'password'}
            value={provider.apiKey}
            onChange={(e) => save({ apiKey: e.target.value })}
            placeholder="sk-..."
            spellCheck={false}
            autoComplete="off"
            className="pr-10 font-mono text-[13px]"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-faint hover:text-text"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-xs text-faint">
          <ShieldCheck size={13} className="mt-px shrink-0" />
          {t('provider.keyNote')}
        </div>
      </div>

      <div>
        <Label
          hint={t('provider.modelsHint')}
          action={
            <Button
              size="sm"
              onClick={fetchModels}
              disabled={fetchState.loading || !provider.baseUrl || !provider.apiKey}
            >
              {fetchState.loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {fetchState.loading ? t('provider.fetching') : t('provider.fetchModels')}
            </Button>
          }
        >
          {t('provider.models')}
        </Label>
        <Textarea
          rows={5}
          value={modelsText}
          onChange={(e) => setModels(e.target.value)}
          spellCheck={false}
          className="font-mono text-[13px]"
        />
        {fetchState.message && (
          <div className={clsx('mt-1.5 text-xs', fetchState.error ? 'text-danger' : 'text-muted')}>
            {fetchState.message}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <Button variant="danger" size="sm" onClick={remove}>
          <Trash2 size={14} />
          {t('provider.delete')}
        </Button>
      </div>
    </div>
  )
}

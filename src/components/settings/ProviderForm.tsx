import clsx from 'clsx'
import { Eye, EyeOff, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { db, type Provider } from '../../db'
import { useT } from '../../i18n'
import { addModels } from '../../lib/models'
import { getAdapter, listModels, PROTOCOLS, ProviderError } from '../../providers'
import { joinUrl } from '../../providers/types'
import { Button } from '../ui/Button'
import { confirmDialog } from '../ui/Dialog'
import { Input, Label } from '../ui/Field'
import { ModelConfigPage } from './ModelConfigPage'
import { ModelList } from './ModelList'

/**
 * A provider's settings, or the config page of one of its models (`initialModel` opens straight into it).
 * `provider` is the live stored record.
 */
export function ProviderForm({ provider, initialModel }: { provider: Provider; initialModel?: string }) {
  // Which model's page is open: a name, null for a new model, undefined for the provider's own fields.
  const [page, setPage] = useState<string | null | undefined>(
    initialModel && provider.models.includes(initialModel) ? initialModel : undefined,
  )
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.parentElement?.scrollTo(0, 0)
  }, [page])

  return (
    <div ref={rootRef}>
      {page === undefined ? (
        <ProviderFields provider={provider} onOpenModel={setPage} />
      ) : (
        <ModelConfigPage key={page ?? ''} provider={provider} model={page} onBack={() => setPage(undefined)} />
      )}
    </div>
  )
}

/** The provider's own fields and its model list; every change is saved immediately. */
function ProviderFields({
  provider: stored,
  onOpenModel,
}: {
  provider: Provider
  onOpenModel: (model: string | null) => void
}) {
  const t = useT()
  // Local copy so inputs stay responsive; IndexedDB writes are async. Models change elsewhere, so they
  // always come from the stored record.
  const [local, setLocal] = useState(stored)
  const provider = { ...local, models: stored.models, modelConfigs: stored.modelConfigs }
  const [showKey, setShowKey] = useState(false)
  const adapter = getAdapter(provider.protocol)
  const [fetchState, setFetchState] = useState<{ loading?: boolean; message?: string; error?: boolean }>({})

  const save = (patch: Partial<Provider>) => {
    setLocal((p) => ({ ...p, ...patch }))
    db.providers.update(provider.id, patch)
  }

  const fetchModels = async () => {
    setFetchState({ loading: true })
    try {
      const models = await listModels(provider)
      if (models.length === 0) throw new ProviderError('Empty model list')
      const added = await addModels(provider, models)
      setFetchState({ message: t('provider.fetched', { n: models.length, added }) })
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
        <Input value={provider.name} onChange={(e) => save({ name: e.target.value })} placeholder={t('provider.namePlaceholder')} />
      </div>

      <div>
        <Label>{t('provider.protocol')}</Label>
        <div className="grid grid-cols-3 gap-2">
          {PROTOCOLS.map((p) => (
            <button
              key={p}
              onClick={() => save({ protocol: p })}
              className={clsx(
                'rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
                provider.protocol === p
                  ? 'border-accent bg-accent-soft font-medium text-text'
                  : 'border-border text-muted hover:border-border-strong hover:text-text',
              )}
            >
              {t(`protocol.${p}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>{t('provider.baseUrl')}</Label>
        <Input
          value={provider.baseUrl}
          onChange={(e) => save({ baseUrl: e.target.value })}
          placeholder={provider.protocol === 'anthropic' ? 'https://api.example.com' : 'https://api.example.com/v1'}
          spellCheck={false}
          className="font-mono text-[13px]"
        />
        {provider.baseUrl.trim() && (
          <div className="mt-1.5 truncate font-mono text-xs text-faint">
            {t('provider.endpoint', { url: joinUrl(provider.baseUrl, adapter.chatPath) })}
          </div>
        )}
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
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchModels}
                disabled={fetchState.loading || !provider.baseUrl || !provider.apiKey}
              >
                {fetchState.loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {fetchState.loading ? t('provider.fetching') : t('provider.fetchModels')}
              </Button>
              <Button size="sm" onClick={() => onOpenModel(null)}>
                <Plus size={13} />
                {t('model.add')}
              </Button>
            </div>
          }
        >
          {t('provider.models')}
        </Label>
        <ModelList provider={provider} onOpen={onOpenModel} />
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

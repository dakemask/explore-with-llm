import clsx from 'clsx'
import { Eye, EyeOff, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db, type Provider } from '../../db'
import { useT } from '../../i18n'
import { addModels } from '../../lib/models'
import { getAdapter, listModels, PROTOCOLS, ProviderError } from '../../providers'
import { joinUrl } from '../../providers/types'
import { Button } from '../ui/Button'
import { confirmDialog } from '../ui/Dialog'
import { notifyError } from '../ui/Toast'
import { Input, Label } from '../ui/Field'
import { FetchedModels, PICK_THRESHOLD } from './FetchedModels'
import { ModelConfigDialog } from './ModelConfigDialog'
import { ModelList } from './ModelList'

/**
 * A provider's own fields (saved immediately) and its model list; a model's config opens in a dialog
 * (`initialModel` opens straight into it). `provider` is the live stored record.
 */
export function ProviderForm({ provider: stored, initialModel }: { provider: Provider; initialModel?: string }) {
  const t = useT()
  // The model whose config dialog is open: a name, null for a new model, undefined for none.
  const [editing, setEditing] = useState<string | null | undefined>(
    initialModel && stored.models.includes(initialModel) ? initialModel : undefined,
  )
  // Local copy so inputs stay responsive; IndexedDB writes are async. Models change elsewhere, so they
  // always come from the stored record.
  const [local, setLocal] = useState(stored)
  const provider = { ...local, models: stored.models, modelConfigs: stored.modelConfigs }
  const [showKey, setShowKey] = useState(false)
  const adapter = getAdapter(provider.protocol)
  const [fetchState, setFetchState] = useState<{ loading?: boolean; message?: string }>({})
  // A long fetched list is picked from in a dialog instead of being added wholesale.
  const [fetched, setFetched] = useState<string[]>([])
  const [pickOpen, setPickOpen] = useState(false)

  const save = (patch: Partial<Provider>) => {
    setLocal((p) => ({ ...p, ...patch }))
    db.providers.update(provider.id, patch)
  }

  const fetchModels = async () => {
    setFetchState({ loading: true })
    setFetched([])
    try {
      const models = [...new Set(await listModels(provider))]
      if (models.length === 0) throw new ProviderError('Empty model list')
      if (models.length >= PICK_THRESHOLD) {
        setFetched(models)
        setPickOpen(true)
        setFetchState({ message: t('provider.fetchedPick', { n: models.length }) })
        return
      }
      const added = await addModels(provider, models)
      setFetchState({ message: t('provider.fetched', { n: models.length, added }) })
    } catch (e) {
      const err = e as ProviderError
      setFetchState({})
      notifyError(t('provider.fetchFailed'), err.code === 'network' ? t('error.network') : err.message)
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
              <Button size="sm" onClick={() => setEditing(null)}>
                <Plus size={13} />
                {t('model.add')}
              </Button>
            </div>
          }
        >
          {t('provider.models')}
        </Label>
        <ModelList provider={provider} onOpen={setEditing} />
        {fetchState.message && (
          <div className="mt-1.5 text-xs text-muted">
            {fetchState.message}
            {fetched.length > 0 && (
              <button onClick={() => setPickOpen(true)} className="ml-1.5 text-accent hover:underline">
                {t('provider.fetchedOpen')}
              </button>
            )}
          </div>
        )}
        <FetchedModels open={pickOpen} onOpenChange={setPickOpen} provider={provider} models={fetched} />
        {editing !== undefined && (
          <ModelConfigDialog
            key={editing ?? ''}
            provider={provider}
            model={editing}
            onClose={() => setEditing(undefined)}
          />
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

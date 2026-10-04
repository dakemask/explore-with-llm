import clsx from 'clsx'
import { BookOpen, Check, ChevronDown, CircleAlert, CircleCheck, Copy, Files } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Provider } from '../../db'
import { useT } from '../../i18n'
import { useCopy } from '../../lib/hooks'
import { paramsDoc, paramsExample } from '../../lib/paramsDoc'
import { modelParams } from '../../providers'
import { useSettings } from '../../store/settings'
import { Markdown } from '../chat/Markdown'
import { Button } from '../ui/Button'
import { confirmDialog, Dialog } from '../ui/Dialog'
import { Label, Textarea } from '../ui/Field'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'

/** Per-model parameter configs of one provider: pick a model, edit its JSON, see whether it parses. */
export function ParamsEditor({
  provider,
  initialModel,
  onSave,
}: {
  provider: Provider
  initialModel?: string
  onSave: (modelParams: Record<string, string>) => void
}) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  // Local copy so typing stays responsive; IndexedDB writes are async.
  const [drafts, setDrafts] = useState<Record<string, string>>(provider.modelParams ?? {})
  const [model, setModel] = useState(initialModel ?? provider.models[0])
  const [docOpen, setDocOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Opened for a specific model (from the composer): bring the editor into view.
  useEffect(() => {
    if (initialModel) rootRef.current?.scrollIntoView({ block: 'start' })
  }, [initialModel])

  // The model list is edited above; keep a valid selection.
  useEffect(() => {
    if (!model || !provider.models.includes(model)) setModel(provider.models[0])
  }, [provider.models, model])

  const text = model ? (drafts[model] ?? '') : ''
  const result = useMemo(
    () => (model ? modelParams({ ...provider, modelParams: { [model]: text } }, model) : undefined),
    [provider, model, text],
  )

  const write = (m: string, value: string) => {
    const next = { ...drafts }
    if (value.trim()) next[m] = value
    else delete next[m]
    setDrafts(next)
    onSave(next)
  }

  const copyFrom = async (source: string) => {
    if (!model) return
    if (text.trim() && !(await confirmDialog(t('provider.paramsCopyConfirm', { model })))) return
    write(model, drafts[source] ?? '')
  }

  const configured = provider.models.filter((m) => m !== model && drafts[m]?.trim())

  return (
    <div ref={rootRef} className="scroll-mt-5">
      <Label
        hint={t('provider.paramsHint')}
        action={
          <Button size="sm" variant="ghost" onClick={() => setDocOpen(true)}>
            <BookOpen size={13} />
            {t('provider.paramsDoc')}
          </Button>
        }
      >
        {t('provider.params')}
      </Label>

      {provider.models.length === 0 || !model ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-faint">
          {t('provider.paramsNoModels')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border transition-colors focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
          <div className="flex items-center gap-1 border-b border-border bg-subtle px-1.5 py-1">
            <MenuRoot>
              <MenuTrigger asChild>
                <button className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 font-mono text-[13px] font-medium transition-colors hover:bg-hover data-[state=open]:bg-hover">
                  <span className="truncate">{model}</span>
                  <ChevronDown size={13} className="shrink-0 text-faint" />
                </button>
              </MenuTrigger>
              <MenuContent className="w-72">
                {provider.models.map((m) => (
                  <MenuItem
                    key={m}
                    selected={m === model}
                    icon={<Check size={14} className={clsx(m !== model && 'invisible')} />}
                    onSelect={() => setModel(m)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate font-mono">{m}</span>
                      {drafts[m]?.trim() && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                    </span>
                  </MenuItem>
                ))}
              </MenuContent>
            </MenuRoot>
            <div className="flex-1" />
            {configured.length > 0 && (
              <MenuRoot>
                <MenuTrigger asChild>
                  <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted transition-colors hover:bg-hover hover:text-text data-[state=open]:bg-hover">
                    <Files size={13} />
                    {t('provider.paramsCopyFrom')}
                  </button>
                </MenuTrigger>
                <MenuContent align="end" className="w-64">
                  {configured.map((m) => (
                    <MenuItem key={m} onSelect={() => copyFrom(m)}>
                      <span className="font-mono">{m}</span>
                    </MenuItem>
                  ))}
                </MenuContent>
              </MenuRoot>
            )}
          </div>
          <Textarea
            key={model}
            rows={10}
            value={text}
            onChange={(e) => write(model, e.target.value)}
            placeholder={paramsExample(lang)}
            spellCheck={false}
            className="rounded-none border-0 font-mono text-[12.5px] focus:ring-0!"
          />
          <div
            className={clsx(
              'flex items-start gap-1.5 border-t border-border px-3 py-2 text-xs',
              result && !result.ok ? 'bg-danger-soft text-danger' : 'text-muted',
            )}
          >
            {result && !result.ok ? (
              <>
                <CircleAlert size={13} className="mt-px shrink-0" />
                {t(result.error.key, result.error.vars)}
              </>
            ) : result?.ok && result.missing ? (
              // With default choices, a field the protocol requires isn't supplied.
              <span className="flex items-start gap-1.5 text-danger">
                <CircleAlert size={13} className="mt-px shrink-0" />
                {t('provider.paramsRequired', { field: result.missing })}
              </span>
            ) : !text.trim() ? (
              <span className="text-faint">{t('provider.paramsBlank')}</span>
            ) : (
              result?.ok && (
                <>
                  <CircleCheck size={13} className="mt-px shrink-0 text-success" />
                  {t('provider.paramsOk', {
                    n: result.config.params.length,
                    m: result.config.items.length - result.config.params.length,
                  })}
                </>
              )
            )}
          </div>
        </div>
      )}

      <ParamsDocDialog open={docOpen} onOpenChange={setDocOpen} />
    </div>
  )
}

function ParamsDocDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const { copied, copy } = useCopy()
  const doc = paramsDoc(lang)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('provider.paramsDocTitle')} className="max-w-3xl">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <Markdown text={doc} className="prose-compact" />
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="primary" onClick={() => copy(doc)}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? t('msg.copied') : t('provider.copyDoc')}
        </Button>
      </div>
    </Dialog>
  )
}

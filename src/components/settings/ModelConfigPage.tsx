import { ChevronLeft, Files, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelConfig, Provider } from '../../db'
import { useT } from '../../i18n'
import { addModel, hasConfig, modelNameError, removeModel, renameModel, setModelConfig } from '../../lib/models'
import { parseHeaders } from '../../lib/params'
import { presetById, presetConfig, type ModelPreset } from '../../lib/presets'
import { Button } from '../ui/Button'
import { confirmDialog } from '../ui/Dialog'
import { Input, Label, Textarea } from '../ui/Field'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'
import { Switch } from '../ui/Switch'
import { ParamsEditor } from './ParamsEditor'
import { PresetPicker } from './PresetPicker'

/**
 * Everything about one model of a provider: its name, parameters, echo-back and headers, plus filling
 * all of it from a built-in preset or another model. `model: null` adds a new model; it's created once
 * it has a valid name, and edits made before that are kept and saved with it.
 */
export function ModelConfigPage({
  provider,
  model: initialModel,
  onBack,
}: {
  provider: Provider
  model: string | null
  onBack: () => void
}) {
  const t = useT()
  // The model's stored name; null until a new model is created.
  const [model, setModel] = useState(initialModel)
  const [name, setName] = useState(initialModel ?? '')
  // Local copy so inputs stay responsive; IndexedDB writes are async.
  const [config, setConfig] = useState<ModelConfig>(() => (initialModel && provider.modelConfigs?.[initialModel]) || {})
  const [echoText, setEchoText] = useState((config.echoFields ?? []).join(', '))
  const [pickerOpen, setPickerOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const nameError = modelNameError(provider, name, model)
  const badHeaderLine = parseHeaders(config.headers ?? '').badLine
  const preset = presetById(config.preset)
  // Edited since the preset was applied?
  const presetChanged = preset && JSON.stringify(withoutEmpty(presetConfig(preset))) !== JSON.stringify(withoutEmpty(config))

  useEffect(() => {
    if (initialModel === null) nameRef.current?.focus()
  }, [initialModel])

  const save = (next: ModelConfig) => {
    setConfig(next)
    if (model) setModelConfig(provider.id, model, withoutEmpty(next))
  }
  const patch = (p: Partial<ModelConfig>) => save({ ...config, ...p })

  /** Creates the new model or renames this one, if the typed name is valid. */
  const commitName = async (value = name) => {
    const n = value.trim()
    if (modelNameError(provider, n, model) || n === model) return
    if (model) await renameModel(provider.id, model, n)
    else await addModel(provider.id, n, withoutEmpty(config))
    setModel(n)
    setName(n)
  }

  const replaceConfig = async (next: ModelConfig, label: string) => {
    if (hasConfig(config) && !(await confirmDialog(t('model.replaceConfirm', { source: label })))) return false
    setEchoText((next.echoFields ?? []).join(', '))
    save(next)
    return true
  }

  const applyPreset = async (p: ModelPreset) => {
    if (await replaceConfig(presetConfig(p), p.label)) setPickerOpen(false)
  }

  const copyFrom = (source: string) => replaceConfig({ ...provider.modelConfigs?.[source] }, source)

  const remove = async () => {
    if (!model) return onBack()
    if (!(await confirmDialog(t('model.deleteConfirm', { model }), { danger: true }))) return
    await removeModel(provider.id, model)
    onBack()
  }

  const others = provider.models.filter((m) => m !== model && hasConfig(provider.modelConfigs?.[m]))

  return (
    <div className="p-6">
      <button
        onClick={onBack}
        className="-ml-1.5 flex h-7 items-center gap-0.5 rounded-md pr-2 pl-1 text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
      >
        <ChevronLeft size={15} />
        {provider.name || t('model.back')}
      </button>
      <h3 className="mt-2 truncate font-mono text-[15px] font-semibold">{model ?? t('model.new')}</h3>

      {/* Presets: fill everything below in one go. */}
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-subtle px-3.5 py-3">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">
            {preset ? t('model.presetApplied', { name: preset.label }) : t('model.presets')}
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-faint">
            {preset ? (presetChanged ? t('model.presetChanged') : t('model.presetIntact')) : t('model.presetsHint')}
          </div>
        </div>
        {others.length > 0 && (
          <MenuRoot>
            <MenuTrigger asChild>
              <Button size="sm" variant="ghost" className="data-[state=open]:bg-hover">
                <Files size={13} />
                {t('model.copyFrom')}
              </Button>
            </MenuTrigger>
            <MenuContent align="end" className="w-64">
              {others.map((m) => (
                <MenuItem key={m} onSelect={() => copyFrom(m)}>
                  <span className="truncate font-mono">{m}</span>
                </MenuItem>
              ))}
            </MenuContent>
          </MenuRoot>
        )}
        <Button size="sm" variant="primary" onClick={() => setPickerOpen(true)}>
          {t('model.choosePreset')}
        </Button>
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <Label hint={t('model.nameHint')}>{t('model.name')}</Label>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => commitName()}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
            placeholder="model-id"
            spellCheck={false}
            className="font-mono text-[13px]"
          />
          {nameError === 'taken' && <div className="mt-1.5 text-xs text-danger">{t('model.nameTaken')}</div>}
          {!model && nameError === 'empty' && <div className="mt-1.5 text-xs text-faint">{t('model.nameNeeded')}</div>}
        </div>

        <ParamsEditor provider={provider} value={config.params ?? ''} onChange={(params) => patch({ params })} />

        <div>
          <Label
            hint={t('provider.echoHint')}
            action={
              <Switch
                checked={!!config.echoReasoning}
                onChange={(echoReasoning) => patch({ echoReasoning })}
                label={t('provider.echo')}
              />
            }
          >
            {t('provider.echo')}
          </Label>
          {config.echoReasoning && (
            <div className="mt-3 rounded-lg bg-subtle p-3">
              <div className="mb-1.5 text-xs font-medium text-muted">{t('provider.echoFields')}</div>
              <Input
                value={echoText}
                onChange={(e) => {
                  setEchoText(e.target.value)
                  patch({ echoFields: [...new Set(e.target.value.split(/[\s,，]+/).filter(Boolean))] })
                }}
                placeholder={t('provider.echoAuto')}
                spellCheck={false}
                className="font-mono text-[13px]"
              />
              <div className="mt-1.5 text-xs leading-relaxed text-faint">
                {t(`echo.auto.${provider.protocol}`)} {t('echo.manual')}
              </div>
            </div>
          )}
        </div>

        <div>
          <Label hint={t('provider.headersHint')}>{t('provider.headers')}</Label>
          <Textarea
            rows={3}
            value={config.headers ?? ''}
            onChange={(e) => patch({ headers: e.target.value })}
            placeholder="X-Title: Explore"
            spellCheck={false}
            className="font-mono text-[13px]"
          />
          {badHeaderLine && (
            <div className="mt-1.5 text-xs text-danger">{t('provider.headersBad', { n: badHeaderLine })}</div>
          )}
        </div>

        <div className="border-t border-border pt-5">
          <Button variant="danger" size="sm" onClick={remove}>
            <Trash2 size={14} />
            {model ? t('model.delete') : t('model.discard')}
          </Button>
        </div>
      </div>

      <PresetPicker open={pickerOpen} onOpenChange={setPickerOpen} protocol={provider.protocol} onPick={applyPreset} />
    </div>
  )
}

/** Drops empty fields so "nothing configured" has one shape. */
function withoutEmpty(c: ModelConfig): ModelConfig {
  const out: ModelConfig = {}
  if (c.params?.trim()) out.params = c.params
  if (c.echoReasoning) out.echoReasoning = true
  if (c.echoFields?.length) out.echoFields = c.echoFields
  if (c.headers?.trim()) out.headers = c.headers
  if (c.preset) out.preset = c.preset
  return out
}

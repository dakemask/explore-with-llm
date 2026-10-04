import { Files, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ModelConfig, Provider } from '../../db'
import { useT } from '../../i18n'
import { addModel, hasConfig, modelNameError, removeModel, renameModel, setModelConfig } from '../../lib/models'
import { parseHeaders } from '../../lib/params'
import { presetById, presetConfig, type ModelPreset } from '../../lib/presets'
import { paramConfig } from '../../providers'
import { Button, HelpTip } from '../ui/Button'
import { confirmDialog, Dialog } from '../ui/Dialog'
import { Input, Label, Textarea } from '../ui/Field'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/Menu'
import { Switch } from '../ui/Switch'
import { notifyError } from '../ui/Toast'
import { ParamsEditor } from './ParamsEditor'
import { PresetPicker } from './PresetPicker'

/**
 * Everything about one model of a provider: its name, parameters, echo-back and headers, plus filling
 * all of it from a built-in preset or another model. `model: null` adds a new model. Edits are a draft:
 * nothing is checked or stored until Save, which reports every problem at once.
 */
export function ModelConfigDialog({
  provider,
  model,
  onClose,
}: {
  provider: Provider
  /** The model to edit; null for a new one. */
  model: string | null
  onClose: () => void
}) {
  const t = useT()
  const [initial] = useState<ModelConfig>(() => withoutEmpty((model && provider.modelConfigs?.[model]) || {}))
  const [name, setName] = useState(model ?? '')
  const [config, setConfig] = useState<ModelConfig>(initial)
  const [echoText, setEchoText] = useState((config.echoFields ?? []).join(', '))
  const [pickerOpen, setPickerOpen] = useState(false)
  const preset = presetById(config.preset)
  // Edited since the preset was applied?
  const presetChanged = preset && JSON.stringify(withoutEmpty(presetConfig(preset))) !== JSON.stringify(withoutEmpty(config))
  const dirty = name.trim() !== (model ?? '') || JSON.stringify(withoutEmpty(config)) !== JSON.stringify(initial)

  const patch = (p: Partial<ModelConfig>) => setConfig((c) => ({ ...c, ...p }))

  const close = async () => {
    if (dirty && !(await confirmDialog(t('model.discardChanges')))) return
    onClose()
  }

  const save = async () => {
    const n = name.trim()
    const next = withoutEmpty(config)
    const problems: string[] = []
    const nameError = modelNameError(provider, n, model)
    if (nameError) problems.push(t(nameError === 'empty' ? 'model.nameEmpty' : 'model.nameTaken'))
    const params = paramConfig({ ...provider, modelConfigs: { m: next } }, 'm')
    if (!params.ok) problems.push(t('model.paramsError', { error: t(params.error.key, params.error.vars) }))
    const badLine = parseHeaders(next.headers ?? '').badLine
    if (badLine) problems.push(t('provider.headersBad', { n: badLine }))
    if (problems.length) return notifyError(t('model.saveFailed'), problems)

    if (!model) await addModel(provider.id, n, next)
    else {
      if (n !== model) await renameModel(provider.id, model, n)
      await setModelConfig(provider.id, n, next)
    }
    onClose()
  }

  const replaceConfig = async (next: ModelConfig, label: string) => {
    if (hasConfig(config) && !(await confirmDialog(t('model.replaceConfirm', { source: label })))) return false
    setEchoText((next.echoFields ?? []).join(', '))
    setConfig(next)
    return true
  }

  const applyPreset = async (p: ModelPreset) => {
    if (await replaceConfig(presetConfig(p), p.label)) setPickerOpen(false)
  }

  const copyFrom = (source: string) => replaceConfig({ ...provider.modelConfigs?.[source] }, source)

  const remove = async () => {
    if (!model || !(await confirmDialog(t('model.deleteConfirm', { model }), { danger: true }))) return
    await removeModel(provider.id, model)
    onClose()
  }

  const others = provider.models.filter((m) => m !== model && hasConfig(provider.modelConfigs?.[m]))

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title={model ? <span className="font-mono">{model}</span> : t('model.add')}
      className="max-w-2xl"
      initialFocus={model ? undefined : 'input'}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {/* Presets: fill everything below in one go. */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-subtle px-3.5 py-3">
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
            <Label>{t('model.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('model.namePlaceholder')}
              spellCheck={false}
              className="font-mono text-[13px]"
            />
          </div>

          <ParamsEditor value={config.params ?? ''} onChange={(params) => patch({ params })} />

          <div>
            <Label
              help={t('provider.echoHint')}
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
                <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted">
                  {t('provider.echoFields')}
                  <HelpTip content={`${t(`echo.auto.${provider.protocol}`)} ${t('echo.manual')}`} />
                </div>
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
              </div>
            )}
          </div>

          <div>
            <Label hint={t('provider.headersHint')} help={t('provider.headersHelp')}>
              {t('provider.headers')}
            </Label>
            <Textarea
              rows={3}
              value={config.headers ?? ''}
              onChange={(e) => patch({ headers: e.target.value })}
              placeholder="X-Title: Explore"
              spellCheck={false}
              className="font-mono text-[13px]"
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3">
        {model && (
          <Button variant="danger" size="sm" onClick={remove}>
            <Trash2 size={14} />
            {t('model.delete')}
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={close}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={save}>
          {t('common.save')}
        </Button>
      </div>

      <PresetPicker open={pickerOpen} onOpenChange={setPickerOpen} protocol={provider.protocol} onPick={applyPreset} />
    </Dialog>
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

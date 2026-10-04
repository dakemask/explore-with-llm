import { Settings2, X } from 'lucide-react'
import type { Provider } from '../../db'
import { useT } from '../../i18n'
import { hasConfig, removeModel } from '../../lib/models'
import { presetById } from '../../lib/presets'
import { modelParams } from '../../providers'
import { IconButton } from '../ui/Button'
import { confirmDialog } from '../ui/Dialog'

/** A provider's models. Clicking a row (or its gear) opens the model's config page. */
export function ModelList({ provider, onOpen }: { provider: Provider; onOpen: (model: string) => void }) {
  const t = useT()

  if (provider.models.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-faint">
        {t('model.empty')}
      </div>
    )
  }

  const remove = async (model: string) => {
    const config = provider.modelConfigs?.[model]
    if (hasConfig(config) && !(await confirmDialog(t('model.deleteConfirm', { model }), { danger: true }))) return
    await removeModel(provider.id, model)
  }

  return (
    <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
      {provider.models.map((m) => {
        const summary = describe(provider, m, t)
        return (
          <li key={m}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(m)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(m))}
              className="group flex cursor-pointer items-center gap-2 py-1.5 pr-1.5 pl-3 transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[13px]">{m}</div>
                <div className="truncate text-[11.5px] text-faint">
                  {summary.text}
                </div>
              </div>
              <IconButton
                label={t('model.configure')}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(m)
                }}
              >
                <Settings2 size={15} />
              </IconButton>
              <IconButton
                label={t('model.delete')}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(m)
                }}
                className="hover:text-danger!"
              >
                <X size={15} />
              </IconButton>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** One line about a model's config: its preset, or what's configured. */
function describe(provider: Provider, model: string, t: ReturnType<typeof useT>): { text: string } {
  const config = provider.modelConfigs?.[model]
  const state = modelParams(provider, model)
  const preset = presetById(config?.preset)
  const parts: string[] = []
  if (preset) parts.push(t('model.fromPreset', { name: preset.label }))
  if (state.ok && state.config.params.length) parts.push(t('model.nParams', { n: state.config.params.length }))
  if (config?.echoReasoning) parts.push(t('provider.echo'))
  if (config?.headers?.trim()) parts.push(t('provider.headers'))
  return { text: parts.length ? parts.join(' · ') : t('model.unconfigured') }
}

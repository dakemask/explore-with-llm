import { db, type ModelConfig, type Provider } from '../db'
import { useSettings } from '../store/settings'

/**
 * Edits to a provider's model list and per-model configs. Each runs as a read-modify-write on the stored
 * provider, so quick successive edits can't overwrite each other with stale copies.
 */
function modify(providerId: string, fn: (p: Provider) => void) {
  return db.providers.where('id').equals(providerId).modify(fn)
}

/** Model names are trimmed; empty or already-used names are rejected. */
export function modelNameError(provider: Provider, name: string, current: string | null): 'empty' | 'taken' | undefined {
  const n = name.trim()
  if (!n) return 'empty'
  if (n !== current && provider.models.includes(n)) return 'taken'
}

export function addModel(providerId: string, name: string, config: ModelConfig = {}) {
  return modify(providerId, (p) => {
    if (p.models.includes(name)) return
    p.models = [...p.models, name]
    if (Object.keys(config).length) p.modelConfigs = { ...p.modelConfigs, [name]: config }
  })
}

/** Adds the names not in the list yet; returns how many were new. */
export async function addModels(provider: Provider, names: string[]) {
  const fresh = [...new Set(names)].filter((n) => !provider.models.includes(n))
  if (fresh.length) await modify(provider.id, (p) => void (p.models = [...p.models, ...fresh.filter((n) => !p.models.includes(n))]))
  return fresh.length
}

export function setModelConfig(providerId: string, model: string, config: ModelConfig) {
  return modify(providerId, (p) => {
    const configs = { ...p.modelConfigs }
    if (Object.keys(config).length) configs[model] = config
    else delete configs[model]
    p.modelConfigs = configs
  })
}

/** Renames in place (keeps the position), moving its config and remembered parameter choices along. */
export async function renameModel(providerId: string, from: string, to: string) {
  await modify(providerId, (p) => {
    p.models = p.models.map((m) => (m === from ? to : m))
    const configs = { ...p.modelConfigs }
    if (configs[from]) configs[to] = configs[from]
    delete configs[from]
    p.modelConfigs = configs
  })
  useSettings.getState().renameModel(providerId, from, to)
}

export function removeModel(providerId: string, model: string) {
  return modify(providerId, (p) => {
    p.models = p.models.filter((m) => m !== model)
    const configs = { ...p.modelConfigs }
    delete configs[model]
    p.modelConfigs = configs
  })
}

/** Whether the model has anything configured that applying a preset or copy would replace. */
export function hasConfig(c: ModelConfig | undefined) {
  return !!(c?.params?.trim() || c?.echoReasoning || c?.echoFields?.length || c?.headers?.trim())
}

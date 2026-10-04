import type { ModelConfig, Protocol } from '../db/types'
import { PRESET_DATA } from './presetData'

/**
 * Built-in model presets: a model's parameter config, echo-back choice and headers for one official
 * vendor API, researched from the vendor docs (see `presetData.ts`). Applying one replaces the model's
 * whole config.
 */
export interface ModelPreset {
  /** `protocol/model`. */
  id: string
  protocol: Protocol
  vendor: string
  /** Display name, e.g. "DeepSeek V4 Pro". */
  label: string
  model: string
  /** The vendor's base URL, written the way this protocol expects. */
  baseUrl: string
  tags: string[]
  /** Parameter config items (format of `lib/params.ts`). */
  params: unknown[]
  echoReasoning: boolean
  echoFields?: string[]
  headers?: string
  /** Short caveat shown with the preset. */
  notes?: string
}

export const PRESETS: ModelPreset[] = PRESET_DATA

export function presetById(id: string | undefined) {
  return id ? PRESETS.find((p) => p.id === id) : undefined
}

export function presetConfig(p: ModelPreset): ModelConfig {
  const c: ModelConfig = { preset: p.id }
  if (p.params.length) c.params = JSON.stringify(p.params, null, 2)
  if (p.echoReasoning) c.echoReasoning = true
  if (p.echoFields?.length) c.echoFields = p.echoFields
  if (p.headers?.trim()) c.headers = p.headers
  return c
}

/** Presets for `protocol` matching every word of `query` (name, model id, vendor, tags) and every tag. */
export function searchPresets(protocol: Protocol, query: string, tags: string[]) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return PRESETS.filter((p) => {
    if (p.protocol !== protocol) return false
    if (!tags.every((t) => p.tags.includes(t) || p.vendor === t)) return false
    const hay = [p.label, p.model, p.vendor, ...p.tags].join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** Filter chips for a protocol: vendors first, then tags by how often they occur. */
export function presetTags(protocol: Protocol) {
  const list = PRESETS.filter((p) => p.protocol === protocol)
  const vendors = [...new Set(list.map((p) => p.vendor))]
  const count = new Map<string, number>()
  for (const p of list) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1)
  const tags = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  return vendors.length > 1 ? [...vendors, ...tags] : tags
}

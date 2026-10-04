import type { ModelConfig, Protocol } from '../db/types'
import { PRESET_DATA } from './presetData'

/**
 * Built-in model presets: a model's parameter config, echo-back choice and headers for one official
 * vendor API, researched from the vendor docs (see `presetData.ts`). Applying one replaces the model's
 * whole config; it never touches the model's name or the provider (owner's choice).
 */
export interface ModelPreset {
  /** Stable key stored in `ModelConfig.preset` (`protocol/model-id` at the time it was written). */
  id: string
  protocol: Protocol
  vendor: string
  /** Display name, e.g. "DeepSeek V4 Pro". */
  label: string
  /** Model family tag: "DeepSeek", "GPT", "Claude". The other tags are the channel (official) and `protocol`. */
  series: string
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

/** A filter tag. Every preset currently comes from a vendor's official API, so the only channel is `official`. */
export type PresetTag = { group: 'channel' | 'series' | 'protocol'; value: string }

export function tagsOf(p: ModelPreset): PresetTag[] {
  return [
    { group: 'channel', value: 'official' },
    { group: 'series', value: p.series },
    { group: 'protocol', value: p.protocol },
  ]
}

/** Every filter tag, grouped: channels, series, protocols (in the order they first occur). */
export function allPresetTags(): PresetTag[] {
  const seen = new Set<string>()
  const out: PresetTag[] = []
  for (const group of ['channel', 'series', 'protocol'] as const) {
    for (const p of PRESETS) {
      const tag = tagsOf(p).find((t) => t.group === group)!
      if (!seen.has(group + tag.value)) {
        seen.add(group + tag.value)
        out.push(tag)
      }
    }
  }
  return out
}

/**
 * Presets matching every word of `query` (name, vendor, series, protocol) and the selected tags: any
 * selected tag within a group, every group that has one.
 */
export function searchPresets(query: string, selected: PresetTag[]) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return PRESETS.filter((p) => {
    const own = tagsOf(p)
    const groups = new Set(selected.map((t) => t.group))
    for (const g of groups) {
      if (!selected.some((s) => s.group === g && own.some((t) => t.group === g && t.value === s.value))) return false
    }
    const hay = [p.label, p.vendor, p.series, p.protocol].join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

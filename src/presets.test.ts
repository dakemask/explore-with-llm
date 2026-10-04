import { describe, expect, it } from 'vitest'
import type { Provider } from './db/types'
import { parseHeaders } from './lib/params'
import { allPresetTags, presetConfig, PRESETS, searchPresets } from './lib/presets'
import { modelParams } from './providers'

describe('presets', () => {
  it('have unique ids', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
  })

  for (const p of PRESETS) {
    it(`${p.id} is a valid, sendable config`, () => {
      const provider: Provider = {
        id: 'x',
        name: p.vendor,
        protocol: p.protocol,
        baseUrl: 'https://example.com',
        apiKey: 'k',
        models: ['m'],
        modelConfigs: { m: presetConfig(p) },
        createdAt: 0,
      }
      const state = modelParams(provider, 'm')
      if (!state.ok) throw new Error(JSON.stringify(state.error))
      expect(state.missing).toBeUndefined()
      expect(parseHeaders(p.headers ?? '').badLine).toBeUndefined()
    })
  }

  it('search matches every word', () => {
    const p = PRESETS[0]
    expect(searchPresets(p.label.toUpperCase(), [])).toContain(p)
    expect(searchPresets(`${p.label} zzz-nothing`, [])).not.toContain(p)
  })

  it('tags: any within a group, every group', () => {
    const chat = searchPresets('', [{ group: 'protocol', value: 'openai-chat' }])
    const both = searchPresets('', [
      { group: 'protocol', value: 'openai-chat' },
      { group: 'protocol', value: 'anthropic' },
    ])
    expect(chat.every((p) => p.protocol === 'openai-chat')).toBe(true)
    expect(both.length).toBeGreaterThan(chat.length)
    const deepseekChat = searchPresets('', [
      { group: 'channel', value: 'DeepSeek' },
      { group: 'protocol', value: 'openai-chat' },
    ])
    expect(deepseekChat.length).toBeGreaterThan(0)
    expect(deepseekChat.every((p) => p.vendor === 'DeepSeek')).toBe(true)
    expect(allPresetTags().filter((t) => t.group === 'protocol')).toHaveLength(3)
  })
})

import { describe, expect, it } from 'vitest'
import type { Provider } from './db/types'
import { parseHeaders } from './lib/params'
import { presetConfig, PRESETS, searchPresets } from './lib/presets'
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

  it('search matches every word and every tag', () => {
    const p = PRESETS[0]
    if (!p) return
    expect(searchPresets(p.protocol, p.label.toUpperCase(), [])).toContain(p)
    expect(searchPresets(p.protocol, `${p.label} zzz-nothing`, [])).not.toContain(p)
    expect(searchPresets(p.protocol, '', p.tags)).toContain(p)
  })
})

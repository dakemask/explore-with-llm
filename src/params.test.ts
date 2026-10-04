import { describe, expect, it } from 'vitest'
import { deepMerge, mergeHeaders, parseHeaders, parseParamConfig, resolveParams, snap, type ParamConfig } from './lib/params'
import { paramsExample } from './lib/paramsDoc'
import { prepareChat } from './providers'
import type { Provider } from './db'

const parse = (v: unknown, reserved?: string[]) => parseParamConfig(JSON.stringify(v), reserved)
const config = (v: unknown): ParamConfig => {
  const r = parse(v)
  if (!r.ok) throw new Error(r.error.key)
  return r.config
}

describe('parseParamConfig', () => {
  it('treats empty text as no parameters', () => {
    expect(parseParamConfig('  ')).toEqual({ ok: true, config: { params: [], items: [] } })
  })

  it('accepts the documented examples', () => {
    expect(parseParamConfig(paramsExample('zh'), ['model', 'messages', 'stream']).ok).toBe(true)
    expect(parseParamConfig(paramsExample('en'), ['model', 'messages', 'stream']).ok).toBe(true)
  })

  it('reports what is wrong', () => {
    const err = (v: unknown, reserved?: string[]) => {
      const r = typeof v === 'string' ? parseParamConfig(v) : parse(v, reserved)
      return r.ok ? undefined : r.error.key
    }
    expect(err('{')).toBe('params.err.json')
    expect(err({})).toBe('params.err.notArray')
    expect(err([{ type: 'x', body: {} }])).toBe('params.err.type')
    expect(err([{ type: 'fixed', body: {} }])).toBe('params.err.name')
    expect(err([{ type: 'silent', body: { model: 'x' } }], ['model'])).toBe('params.err.reserved')
    expect(err([{ name: 'a', type: 'choice', body: { e: 'x' }, options: ['x'] }])).toBe('params.err.placeholder')
    expect(err([{ name: 'a', type: 'choice', body: { e: 'EFFORT' }, options: ['x'], default: 'y' }])).toBe(
      'params.err.default',
    )
    expect(err([{ name: 'a', type: 'range', body: { t: 'VALUE' }, min: 2, max: 1 }])).toBe('params.err.range')
    expect(err([{ name: 'a', type: 'fixed', body: {}, requires: { b: true } }])).toBe('params.err.requiresUnknown')
    expect(
      err([
        { name: 'a', type: 'fixed', body: {}, requires: { b: true } },
        { name: 'b', type: 'fixed', body: {}, requires: { a: true } },
      ]),
    ).toBe('params.err.cycle')
    expect(
      err([
        { name: 'a', type: 'fixed', body: {} },
        { name: 'b', type: 'fixed', body: {}, requires: { a: 'x' } },
      ]),
    ).toBe('params.err.requiresValue')
  })
})

describe('resolveParams', () => {
  const cfg = config([
    { name: 'think', type: 'fixed', body: { thinking: { type: 'enabled' } }, toggle: true, defaultOn: true },
    {
      name: 'effort',
      type: 'choice',
      body: { thinking: { effort: 'EFFORT' } },
      options: ['low', 'high'],
      default: 'high',
      requires: { think: true },
    },
    {
      name: 'budget',
      type: 'range',
      body: { thinking: { budget: 'VALUE' } },
      min: 0,
      max: 1,
      step: 0.1,
      default: 0.5,
      requires: { effort: 'high' },
    },
    { type: 'silent', body: { stream_options: { include_usage: true } } },
  ])

  it('uses defaults and merges active bodies in order', () => {
    const { body, params } = resolveParams(cfg)
    expect(params.map((p) => p.active)).toEqual([true, true, true])
    expect(body).toEqual({
      thinking: { type: 'enabled', effort: 'high', budget: 0.5 },
      stream_options: { include_usage: true },
    })
  })

  it('disables dependants down the chain when a parameter is switched off', () => {
    const { body, params } = resolveParams(cfg, { think: { on: false } })
    expect(params.map((p) => p.available)).toEqual([true, false, false])
    expect(body).toEqual({ stream_options: { include_usage: true } })
  })

  it('checks value conditions and snaps stored numbers', () => {
    expect(resolveParams(cfg, { effort: { value: 'low' } }).params[2].available).toBe(false)
    expect(resolveParams(cfg, { budget: { value: 0.73 } }).body.thinking).toMatchObject({ budget: 0.7 })
    // A stored value the config no longer offers falls back to the default.
    expect(resolveParams(cfg, { effort: { value: 'gone' } }).params[1].value).toBe('high')
  })
})

describe('helpers', () => {
  it('snaps without float noise', () => {
    expect(snap(0.3000001, 0, 2, 0.1)).toBe(0.3)
    expect(snap(5000, 256, 4096, 256)).toBe(4096)
  })

  it('deep-merges objects, later wins otherwise', () => {
    expect(deepMerge({ a: { b: 1, c: [1] } }, { a: { c: [2], d: 3 } })).toEqual({ a: { b: 1, c: [2], d: 3 } })
  })

  it('parses headers and replaces built-ins case-insensitively', () => {
    expect(parseHeaders('X-A: 1\n\n# note\nAuthorization: Bearer k')).toEqual({
      headers: { 'X-A': '1', Authorization: 'Bearer k' },
    })
    expect(parseHeaders('ok: 1\nno colon').badLine).toBe(2)
    expect(mergeHeaders({ authorization: 'x', A: '1' }, { Authorization: 'y' })).toEqual({ A: '1', Authorization: 'y' })
  })

  it('builds a request with parameters and custom headers, protocol fields last', () => {
    const provider: Provider = {
      id: 'p',
      name: 'P',
      protocol: 'openai-chat',
      baseUrl: 'http://x/v1/',
      apiKey: 'k',
      models: ['m'],
      headers: 'X-Title: t',
      createdAt: 0,
    }
    const req = prepareChat(provider, 'm', [{ role: 'user', content: 'q' }], { temperature: 1 })
    expect(req.url).toBe('http://x/v1/chat/completions')
    expect(req.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer k', 'X-Title': 't' })
    expect(req.body).toEqual({ model: 'm', messages: [{ role: 'user', content: 'q' }], temperature: 1, stream: true })
  })
})

import { isObj } from '../providers/merge'

/**
 * Per-model request parameters, written by the user as JSON in one generic format (see `PARAMS_DOC`).
 * The app doesn't know what any parameter means; it only shows controls and merges each active
 * parameter's `body` fragment into the request body.
 */

export type ParamValue = string | number | boolean

/** `on`: the other parameter must be active (or inactive); `values`: active with one of these values. */
export type Condition = { param: string; on: boolean } | { param: string; values: ParamValue[] }

interface ParamBase {
  name: string
  body: Record<string, unknown>
  /** Can be switched off; switched off means not sent. */
  toggle: boolean
  defaultOn: boolean
  requires: Condition[]
  /** Explanation shown on hover next to the name. */
  help?: string
}

export type Param =
  | (ParamBase & { type: 'choice'; options: ParamValue[]; default: ParamValue })
  | (ParamBase & { type: 'range'; min: number; max: number; step: number; default: number })
  | (ParamBase & { type: 'fixed' })

export interface ParamConfig {
  /** Shown as controls, in config order. */
  params: Param[]
  /** Every item of the config in order (silent bodies included), for merging. */
  items: ({ type: 'silent'; body: Record<string, unknown> } | Param)[]
}

export const CHOICE_PLACEHOLDER = 'EFFORT'
export const RANGE_PLACEHOLDER = 'VALUE'

export interface ParamError {
  key:
    | 'params.err.json'
    | 'params.err.notArray'
    | 'params.err.notObject'
    | 'params.err.type'
    | 'params.err.name'
    | 'params.err.dupName'
    | 'params.err.body'
    | 'params.err.reserved'
    | 'params.err.placeholder'
    | 'params.err.options'
    | 'params.err.default'
    | 'params.err.range'
    | 'params.err.requires'
    | 'params.err.help'
    | 'params.err.requiresUnknown'
    | 'params.err.requiresValue'
    | 'params.err.cycle'
  vars?: Record<string, string | number>
}

export type ParseResult = { ok: true; config: ParamConfig } | { ok: false; error: ParamError }

class Fail extends Error {
  constructor(public error: ParamError) {
    super(error.key)
  }
}

const isValue = (v: unknown): v is ParamValue => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

function containsPlaceholder(v: unknown, ph: string): boolean {
  if (v === ph) return true
  if (Array.isArray(v)) return v.some((x) => containsPlaceholder(x, ph))
  if (isObj(v)) return Object.values(v).some((x) => containsPlaceholder(x, ph))
  return false
}

/**
 * Parses a model's parameter config. Empty text means no parameters. `reserved` are top-level body
 * fields the protocol itself sets (model, messages…), which a config may not touch.
 */
export function parseParamConfig(text: string, reserved: string[] = []): ParseResult {
  if (!text.trim()) return { ok: true, config: { params: [], items: [] } }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: { key: 'params.err.json', vars: { message: (e as Error).message } } }
  }
  try {
    return { ok: true, config: build(json, reserved) }
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.error }
    throw e
  }
}

function build(json: unknown, reserved: string[]): ParamConfig {
  if (!Array.isArray(json)) throw new Fail({ key: 'params.err.notArray' })
  const items: ParamConfig['items'] = []
  const params: Param[] = []
  json.forEach((raw, i) => {
    const n = i + 1
    if (!isObj(raw)) throw new Fail({ key: 'params.err.notObject', vars: { n } })
    const type = raw.type
    if (type !== 'choice' && type !== 'range' && type !== 'fixed' && type !== 'silent') {
      throw new Fail({ key: 'params.err.type', vars: { n } })
    }
    const body = raw.body
    if (!isObj(body)) throw new Fail({ key: 'params.err.body', vars: { n } })
    const bad = Object.keys(body).find((k) => reserved.includes(k))
    if (bad) throw new Fail({ key: 'params.err.reserved', vars: { n, field: bad } })
    if (type === 'silent') {
      items.push({ type, body })
      return
    }

    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name) throw new Fail({ key: 'params.err.name', vars: { n } })
    if (params.some((p) => p.name === name)) throw new Fail({ key: 'params.err.dupName', vars: { name } })
    const requires = parseRequires(raw.requires, name)
    if (raw.help !== undefined && typeof raw.help !== 'string') throw new Fail({ key: 'params.err.help', vars: { name } })
    const help = typeof raw.help === 'string' ? raw.help.trim() : ''
    const base: ParamBase = {
      name,
      body,
      // A switch means "optional". A parameter with dependencies isn't always sent, so it always has one;
      // unmet dependencies grey the switch out.
      toggle: raw.toggle === true || requires.length > 0,
      defaultOn: raw.defaultOn !== false,
      requires,
      ...(help && { help }),
    }

    let param: Param
    if (type === 'choice') {
      if (!containsPlaceholder(body, CHOICE_PLACEHOLDER)) {
        throw new Fail({ key: 'params.err.placeholder', vars: { name, ph: CHOICE_PLACEHOLDER } })
      }
      const options = raw.options
      if (!Array.isArray(options) || options.length === 0 || !options.every(isValue)) {
        throw new Fail({ key: 'params.err.options', vars: { name } })
      }
      const def = raw.default ?? options[0]
      if (!options.includes(def)) throw new Fail({ key: 'params.err.default', vars: { name } })
      param = { ...base, type, options, default: def }
    } else if (type === 'range') {
      if (!containsPlaceholder(body, RANGE_PLACEHOLDER)) {
        throw new Fail({ key: 'params.err.placeholder', vars: { name, ph: RANGE_PLACEHOLDER } })
      }
      const { min, max, step = 1 } = raw
      if (typeof min !== 'number' || typeof max !== 'number' || typeof step !== 'number' || min > max || step <= 0) {
        throw new Fail({ key: 'params.err.range', vars: { name } })
      }
      const def = raw.default ?? min
      if (typeof def !== 'number' || def < min || def > max) throw new Fail({ key: 'params.err.default', vars: { name } })
      param = { ...base, type, min, max, step, default: def }
    } else {
      param = { ...base, type }
    }
    params.push(param)
    items.push(param)
  })

  // Dependencies must name known parameters, value conditions need a parameter that has values, no cycles.
  const byName = new Map(params.map((p) => [p.name, p]))
  for (const p of params) {
    for (const c of p.requires) {
      const target = byName.get(c.param)
      if (!target) throw new Fail({ key: 'params.err.requiresUnknown', vars: { name: p.name, param: c.param } })
      if ('values' in c && target.type === 'fixed') {
        throw new Fail({ key: 'params.err.requiresValue', vars: { name: p.name, param: c.param } })
      }
    }
  }
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (p: Param) => {
    if (state.get(p.name) === 'done') return
    if (state.get(p.name) === 'visiting') throw new Fail({ key: 'params.err.cycle', vars: { name: p.name } })
    state.set(p.name, 'visiting')
    for (const c of p.requires) visit(byName.get(c.param)!)
    state.set(p.name, 'done')
  }
  params.forEach(visit)

  return { params, items }
}

/** `{"思考": true, "强度": "high", "长度": [1, 2]}` → conditions; booleans mean on/off, anything else values. */
function parseRequires(raw: unknown, name: string): Condition[] {
  if (raw === undefined) return []
  if (!isObj(raw)) throw new Fail({ key: 'params.err.requires', vars: { name } })
  return Object.entries(raw).map(([param, v]) => {
    if (typeof v === 'boolean') return { param, on: v }
    const values = Array.isArray(v) ? v : [v]
    if (values.length === 0 || !values.every(isValue)) throw new Fail({ key: 'params.err.requires', vars: { name } })
    return { param, values }
  })
}

/** What the user picked for one parameter. Missing fields fall back to the config's defaults. */
export interface ParamChoice {
  on?: boolean
  value?: ParamValue
}

export interface ResolvedParam {
  param: Param
  /** The user's switch position (always true without a toggle), kept while dependencies are unmet. */
  on: boolean
  value?: ParamValue
  /** Dependencies are met; otherwise the switch is greyed out (shown off) and nothing is sent. */
  available: boolean
  /** Will be sent. */
  active: boolean
}

/** Snaps a number onto the range's step grid, avoiding float noise like 0.30000000000000004. */
export function snap(v: number, min: number, max: number, step: number) {
  const n = Math.round((Math.min(max, Math.max(min, v)) - min) / step)
  const decimals = Math.max(0, ...[step, min].map((x) => (String(x).split('.')[1] ?? '').length))
  return Math.min(max, Number((min + n * step).toFixed(decimals)))
}

/** Applies the user's choices to a config: each parameter's state, and the merged request body fragment. */
export function resolveParams(
  config: ParamConfig,
  choices: Record<string, ParamChoice> = {},
): { params: ResolvedParam[]; body: Record<string, unknown> } {
  const byName = new Map(config.params.map((p) => [p.name, p]))
  const memo = new Map<string, ResolvedParam>()
  const resolve = (p: Param): ResolvedParam => {
    const cached = memo.get(p.name)
    if (cached) return cached
    const c = choices[p.name] ?? {}
    const on = p.toggle ? (c.on ?? p.defaultOn) : true
    let value: ParamValue | undefined
    if (p.type === 'choice') value = c.value !== undefined && p.options.includes(c.value) ? c.value : p.default
    else if (p.type === 'range') value = typeof c.value === 'number' ? snap(c.value, p.min, p.max, p.step) : p.default
    const available = p.requires.every((cond) => {
      const dep = resolve(byName.get(cond.param)!)
      return 'on' in cond ? dep.active === cond.on : dep.active && cond.values.includes(dep.value!)
    })
    const r: ResolvedParam = { param: p, on, value, available, active: available && on }
    memo.set(p.name, r)
    return r
  }
  const params = config.params.map(resolve)

  let body: Record<string, unknown> = {}
  for (const item of config.items) {
    if (item.type === 'silent') {
      body = deepMerge(body, item.body)
      continue
    }
    const r = memo.get(item.name)!
    if (!r.active) continue
    const ph = item.type === 'choice' ? CHOICE_PLACEHOLDER : item.type === 'range' ? RANGE_PLACEHOLDER : undefined
    body = deepMerge(body, ph ? (fill(item.body, ph, r.value!) as Record<string, unknown>) : item.body)
  }
  return { params, body }
}

function fill(v: unknown, ph: string, value: ParamValue): unknown {
  if (v === ph) return value
  if (Array.isArray(v)) return v.map((x) => fill(x, ph, value))
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, ph, value)]))
  return v
}

/** Objects merge key by key; anything else from `b` replaces `a`. */
export function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k]
    out[k] = isObj(cur) && isObj(v) ? deepMerge(cur, v) : structuredClone(v)
  }
  return out
}

/** `Name: value` per line; blank lines and lines starting with `#` are skipped. Returns the bad line on error. */
export function parseHeaders(text: string): { headers: Record<string, string>; badLine?: number } {
  const headers: Record<string, string> = {}
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    const name = colon > 0 ? line.slice(0, colon).trim() : ''
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return { headers, badLine: i + 1 }
    headers[name] = line.slice(colon + 1).trim()
  }
  return { headers }
}

/** Adds `extra` headers over `base`; a name matching a base header case-insensitively replaces it. */
export function mergeHeaders(base: Record<string, string>, extra: Record<string, string>) {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra)) {
    for (const existing of Object.keys(out)) if (existing.toLowerCase() === k.toLowerCase()) delete out[existing]
    out[k] = v
  }
  return out
}

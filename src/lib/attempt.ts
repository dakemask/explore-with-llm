import type { Attempt, RawChunk } from '../db'
import { SseParser } from '../providers/sse'

/** Token counts pulled out of a provider's usage object; fields are missing when the provider didn't report them. */
export interface UsageSummary {
  input?: number
  output?: number
  reasoning?: number
  cached?: number
}

const num = (v: unknown) => (typeof v === 'number' ? v : undefined)

/** Understands OpenAI Chat (prompt/completion), DeepSeek (prompt_cache_hit) and Anthropic/Responses (input/output) shapes. */
export function summarizeUsage(usage: Attempt['usage']): UsageSummary | null {
  if (!usage) return null
  const u = usage as Record<string, any>
  const s: UsageSummary = {
    input: num(u.prompt_tokens) ?? num(u.input_tokens),
    output: num(u.completion_tokens) ?? num(u.output_tokens),
    reasoning:
      num(u.completion_tokens_details?.reasoning_tokens) ?? num(u.output_tokens_details?.reasoning_tokens),
    cached:
      num(u.prompt_cache_hit_tokens) ??
      num(u.prompt_tokens_details?.cached_tokens) ??
      num(u.input_tokens_details?.cached_tokens) ??
      num(u.cache_read_input_tokens),
  }
  return s.input == null && s.output == null ? null : s
}

/** Pretty-prints JSON text; returns null if it isn't JSON. */
export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

export function formatMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}

export interface TimedEvent {
  /** Milliseconds since the request started, when the event's last byte arrived. */
  t: number
  event?: string
  data: string
  /** `data` parsed as JSON, or undefined if it isn't JSON (e.g. `[DONE]`). */
  json?: unknown
}

/** Splits the recorded response stream into SSE events, each stamped with its arrival time. */
export function streamEvents(chunks: RawChunk[]): TimedEvent[] {
  const parser = new SseParser()
  const out: TimedEvent[] = []
  const add = (t: number, evs: { event?: string; data: string }[]) => {
    for (const ev of evs) {
      let json: unknown
      try {
        json = JSON.parse(ev.data)
      } catch {
        json = undefined
      }
      out.push({ t, event: ev.event, data: ev.data, json })
    }
  }
  for (const c of chunks) add(c.t, parser.push(c.text))
  add(chunks.at(-1)?.t ?? 0, parser.flush())
  return out
}

const FOLD_MARK = '__ewl_fold__'

/**
 * Pretty JSON of a request body with every message except the last replaced by a fold line.
 * Returns the text before and after that line, its indentation and how many messages it hides;
 * null when there is no history to fold.
 */
export function foldHistory(body: unknown): { before: string; after: string; indent: string; hidden: number } | null {
  const b = body as Record<string, unknown> | null
  const key = Array.isArray(b?.messages) ? 'messages' : Array.isArray(b?.input) ? 'input' : null
  if (!b || !key) return null
  const list = b[key] as unknown[]
  if (list.length < 2) return null
  const text = JSON.stringify({ ...b, [key]: [FOLD_MARK, list.at(-1)] }, null, 2)
  const at = text.indexOf(`"${FOLD_MARK}"`)
  const lineStart = text.lastIndexOf('\n', at) + 1
  const lineEnd = text.indexOf('\n', at) + 1
  return {
    before: text.slice(0, lineStart),
    after: text.slice(lineEnd),
    indent: text.slice(lineStart, at),
    hidden: list.length - 1,
  }
}

export const SECRET_HEADER = /authorization|api-?key|token|secret/i

/** Hides the middle of credential header values: "Bearer sk-abc…wxyz". */
export function maskHeader(name: string, value: string) {
  if (!SECRET_HEADER.test(name)) return value
  const m = /^(\w+\s+)?(.*)$/.exec(value)!
  const [scheme = '', secret] = [m[1], m[2]]
  if (secret.length <= 8) return scheme + '•'.repeat(secret.length)
  return `${scheme}${secret.slice(0, 3)}…${secret.slice(-4)}`
}

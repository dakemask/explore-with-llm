import type { Attempt } from '../db'

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

export interface DisplayMessage {
  role: string
  text: string
}

/** The conversation messages inside a request body, as readable text. Null if the body has no message list. */
export function requestMessages(body: unknown): DisplayMessage[] | null {
  const b = body as { system?: unknown; messages?: unknown; input?: unknown } | null
  const list = Array.isArray(b?.messages) ? b.messages : Array.isArray(b?.input) ? b.input : null
  if (!list) return null
  const out: DisplayMessage[] = []
  if (typeof b?.system === 'string') out.push({ role: 'system', text: b.system })
  for (const m of list as { role?: unknown; content?: unknown }[]) {
    out.push({ role: String(m?.role ?? '?'), text: contentText(m?.content) })
  }
  return out
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p?.text === 'string' ? p.text : `[${p?.type ?? 'part'}]`))
      .join('\n')
  }
  return JSON.stringify(content)
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

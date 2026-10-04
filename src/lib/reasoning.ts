import { isObj } from '../providers/merge'

/**
 * Some models (Qwen, local servers…) put their thinking inside the content as `<think>…</think>`.
 * Splits it off; an unclosed tag (still streaming) counts as all thinking so far.
 */
export function splitThink(text: string): { reasoning: string; content: string } {
  const m = /^\s*<think>/.exec(text)
  if (!m) return { reasoning: '', content: text }
  const rest = text.slice(m[0].length)
  const end = rest.indexOf('</think>')
  if (end === -1) return { reasoning: rest.trim(), content: '' }
  return { reasoning: rest.slice(0, end).trim(), content: rest.slice(end + '</think>'.length).trimStart() }
}

/** What to show in a reply's reasoning section. */
export interface ReasoningView {
  text: string
  /** True when `text` is a summary the provider wrote, not the model's raw thinking. */
  isSummary: boolean
  /** Summaries that differ from `text` (some providers send both). */
  summaries: string[]
  /** Byte sizes of encrypted reasoning blobs; they can't be shown, only sent back. */
  encrypted: number[]
}

/**
 * Recognizes the reasoning fields we know of in a native reply message. Unknown shapes are ignored here
 * (they still appear in request details and are echoed back per provider settings).
 * Currently understands OpenAI-compatible `reasoning_content` / `reasoning` (via `plain`) and
 * OpenRouter-style `reasoning_details` items.
 */
export function reasoningView(plain: string, message: unknown): ReasoningView {
  const details = isObj(message) && Array.isArray(message.reasoning_details) ? message.reasoning_details : []
  const texts: string[] = []
  const summaries: string[] = []
  const encrypted: number[] = []
  for (const d of details) {
    if (!isObj(d)) continue
    if (d.type === 'reasoning.text' && typeof d.text === 'string') texts.push(d.text)
    else if (d.type === 'reasoning.summary' && typeof d.summary === 'string') summaries.push(d.summary)
    else if (d.type === 'reasoning.encrypted' && typeof d.data === 'string') encrypted.push(new Blob([d.data]).size)
  }
  const text = plain || texts.join('\n\n')
  // Providers that send both usually put the summary text in the plain field too; compare ignoring whitespace.
  const squash = (s: string) => s.replace(/\s+/g, '')
  const isSummary = !!text && texts.length === 0 && summaries.length > 0 && squash(summaries.join('')) === squash(text)
  return { text, isSummary, summaries: isSummary ? [] : summaries.filter((s) => squash(s) !== squash(text)), encrypted }
}

export function hasReasoning(v: ReasoningView) {
  return !!v.text || v.summaries.length > 0 || v.encrypted.length > 0
}

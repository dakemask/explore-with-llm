import type { Protocol, Provider } from '../db/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** User only: images to send before the text. */
  images?: ImagePayload[]
  /** Native parts of an earlier reply to send back (assistant only), as returned by the adapter's `echo`. */
  extra?: Record<string, unknown>
}

/** An image ready to send: base64 data without the `data:` prefix. */
export interface ImagePayload {
  id: string
  mime: string
  data: string
}

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'finish'; reason: string }
  | { type: 'usage'; usage: Record<string, unknown> }

export interface PreparedRequest {
  url: string
  headers: Record<string, string>
  body: unknown
}

export interface ProtocolAdapter {
  protocol: Protocol
  /** Appended to the provider's base URL for chat requests (shown in settings). */
  chatPath: string
  /**
   * `params` is the user's merged parameter body for this model (see `lib/params.ts`); it never contains
   * `reserved` fields. Custom headers are added by the caller.
   */
  buildRequest(
    provider: Provider,
    model: string,
    messages: ChatMessage[],
    params: Record<string, unknown>,
  ): PreparedRequest
  /** Top-level body fields the protocol sets itself; parameter configs may not use them. */
  reserved: string[]
  /** Body fields the protocol requires but whose value is the user's choice; parameters must supply them. */
  required: string[]
  /**
   * Which parts of an earlier native reply to send back with it. `fields` empty means automatic: the
   * reasoning, once (protocols that offer it under several names would otherwise send it twice).
   * Returns the `extra` that `buildRequest` understands, or undefined for text only.
   */
  echo(message: Record<string, unknown>, fields: string[]): Record<string, unknown> | undefined
  parseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent>
  /**
   * Rebuilds the response the server would have sent without streaming, from the parsed SSE data payloads.
   * Unknown vendor fields are kept, so nothing the model returned is lost.
   */
  aggregate(payloads: unknown[]): unknown
  /** The reply inside an aggregated response, in native shape (what `echo` and reasoning display read). */
  replyMessage(aggregated: unknown): Record<string, unknown> | undefined
  listModels(provider: Provider, headers: Record<string, string>, signal?: AbortSignal): Promise<string[]>
}

export class ProviderError extends Error {
  status?: number
  body?: string
  code?: 'network'
  constructor(message: string, status?: number, body?: string, code?: 'network') {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.body = body
    this.code = code
  }
}

/**
 * A user turn's content: plain text when there are no images (requests without images stay as they were),
 * otherwise the images as `toPart` makes them, then the text (omitted when empty: some APIs reject empty text).
 */
export function userContent(
  { content, images }: ChatMessage,
  toPart: (image: ImagePayload) => unknown,
  textType: string,
): string | unknown[] {
  if (!images?.length) return content
  const parts = images.map(toPart)
  return content ? [...parts, { type: textType, text: content }] : parts
}

export function joinUrl(base: string, path: string) {
  return base.trim().replace(/\/+$/, '') + path
}

/** Model ids from a `{ data: [{ id }] }` (or bare array) model list. */
export async function fetchModelList(url: string, headers: Record<string, string>, signal?: AbortSignal) {
  const res = await fetch(url, { headers, signal })
  const text = await res.text()
  if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, res.status, text)
  const json = JSON.parse(text)
  const list: unknown[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : []
  return list
    .map((m) => (typeof m === 'string' ? m : (m as { id?: string }).id))
    .filter((id): id is string => !!id)
    .sort()
}

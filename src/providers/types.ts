import type { Provider } from '../db/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** Native fields of an earlier reply to send back as-is (assistant only). */
  extra?: Record<string, unknown>
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
  buildRequest(provider: Provider, model: string, messages: ChatMessage[]): PreparedRequest
  parseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent>
  /**
   * Rebuilds the response the server would have sent without streaming, from the parsed SSE data payloads.
   * Unknown vendor fields are kept, so nothing the model returned is lost.
   */
  aggregate(payloads: unknown[]): unknown
  /** The reply message inside an aggregated response, in native shape. */
  replyMessage(aggregated: unknown): Record<string, unknown> | undefined
  listModels(provider: Provider, signal?: AbortSignal): Promise<string[]>
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

export function joinUrl(base: string, path: string) {
  return base.trim().replace(/\/+$/, '') + path
}

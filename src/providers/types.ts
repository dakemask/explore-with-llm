import type { Provider } from '../db/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
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

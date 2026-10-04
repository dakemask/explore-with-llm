import type { Protocol, Provider } from '../db/types'
import { openaiChat } from './openaiChat'
import {
  ProviderError,
  type ChatMessage,
  type PreparedRequest,
  type ProtocolAdapter,
  type StreamEvent,
} from './types'

const adapters: Partial<Record<Protocol, ProtocolAdapter>> = {
  'openai-chat': openaiChat,
}

export const PROTOCOLS: { id: Protocol; available: boolean }[] = [
  { id: 'openai-chat', available: true },
  { id: 'openai-responses', available: false },
  { id: 'anthropic', available: false },
]

export function getAdapter(protocol: Protocol): ProtocolAdapter {
  const a = adapters[protocol]
  if (!a) throw new ProviderError(`Protocol "${protocol}" is not supported yet`)
  return a
}

export function prepareChat(provider: Provider, model: string, messages: ChatMessage[]): PreparedRequest {
  return getAdapter(provider.protocol).buildRequest(provider, model, messages)
}

/** The non-streamed equivalent of a streamed response, rebuilt from its SSE data payloads. */
export function aggregateStream(protocol: Protocol, payloads: unknown[]): unknown {
  return getAdapter(protocol).aggregate(payloads)
}

/** Lets the caller record the HTTP exchange exactly as it happened. */
export interface WireTap {
  onResponse(res: { status: number; statusText: string; headers: Record<string, string> }): void
  /** Each decoded network chunk of a successful response body, before parsing. */
  onChunk(text: string): void
}

/** Sends a prepared request and returns its event stream. Throws ProviderError for HTTP / network failures. */
export async function sendChat(
  provider: Provider,
  req: PreparedRequest,
  signal: AbortSignal,
  tap?: WireTap,
): Promise<AsyncGenerator<StreamEvent>> {
  let res: Response
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal,
    })
  } catch (e) {
    if (signal.aborted) throw e
    // Browsers report CORS rejections and offline errors identically as TypeError.
    throw new ProviderError((e as Error).message, undefined, undefined, 'network')
  }
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => (headers[k] = v))
  tap?.onResponse({ status: res.status, statusText: res.statusText, headers })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new ProviderError(extractErrorMessage(text) ?? `HTTP ${res.status}`, res.status, text)
  }
  return getAdapter(provider.protocol).parseStream(tap ? tapBody(res.body, tap.onChunk) : res.body)
}

/** Passes the bytes through untouched while reporting each chunk as text. */
function tapBody(body: ReadableStream<Uint8Array>, onChunk: (text: string) => void) {
  const decoder = new TextDecoder()
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true })
        if (text) onChunk(text)
        controller.enqueue(chunk)
      },
      flush() {
        const text = decoder.decode()
        if (text) onChunk(text)
      },
    }),
  )
}

function extractErrorMessage(text: string): string | undefined {
  try {
    const j = JSON.parse(text)
    return j.error?.message ?? j.message ?? undefined
  } catch {
    return undefined
  }
}

export { ProviderError }
export type { ChatMessage, StreamEvent }

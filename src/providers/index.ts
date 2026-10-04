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

/** Sends a prepared request and returns its event stream. Throws ProviderError for HTTP / network failures. */
export async function sendChat(
  provider: Provider,
  req: PreparedRequest,
  signal: AbortSignal,
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
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new ProviderError(extractErrorMessage(text) ?? `HTTP ${res.status}`, res.status, text)
  }
  return getAdapter(provider.protocol).parseStream(res.body)
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

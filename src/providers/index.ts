import type { ModelConfig, Protocol, Provider } from '../db/types'
import {
  mergeHeaders,
  parseHeaders,
  parseParamConfig,
  resolveParams,
  type ParamChoice,
  type ParamConfig,
  type ParamError,
  type ParseResult,
  type ResolvedParam,
} from '../lib/params'
import { anthropic } from './anthropic'
import { openaiChat } from './openaiChat'
import { openaiResponses } from './openaiResponses'
import {
  ProviderError,
  type ChatMessage,
  type ImagePayload,
  type PreparedRequest,
  type ProtocolAdapter,
  type StreamEvent,
} from './types'

const adapters: Record<Protocol, ProtocolAdapter> = {
  'openai-chat': openaiChat,
  'openai-responses': openaiResponses,
  anthropic,
}

export const PROTOCOLS: Protocol[] = ['openai-chat', 'openai-responses', 'anthropic']

export function getAdapter(protocol: Protocol): ProtocolAdapter {
  const a = adapters[protocol]
  if (!a) throw new ProviderError(`Protocol "${protocol}" is not supported yet`)
  return a
}

/** The request for one turn: protocol body + the model's parameters, protocol headers + custom headers. */
export function prepareChat(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  params: Record<string, unknown> = {},
): PreparedRequest {
  const req = getAdapter(provider.protocol).buildRequest(provider, model, messages, params)
  return { ...req, headers: mergeHeaders(req.headers, customHeaders(provider, model)) }
}

/** The user's settings for `model` (empty when it has none). */
export function modelConfig(provider: Provider, model: string): ModelConfig {
  return provider.modelConfigs?.[model] ?? {}
}

/** The parameter config the user wrote for `model`, parsed against the protocol's reserved fields. */
export function paramConfig(provider: Provider, model: string): ParseResult {
  const adapter = adapters[provider.protocol]
  return parseParamConfig(modelConfig(provider, model).params ?? '', adapter?.reserved)
}

/** The model's parameters with the user's choices applied. */
export function modelParams(
  provider: Provider,
  model: string,
  choices?: Record<string, ParamChoice>,
):
  | { ok: false; error: ParamError }
  | { ok: true; config: ParamConfig; params: ResolvedParam[]; body: Record<string, unknown> } {
  const parsed = paramConfig(provider, model)
  if (!parsed.ok) return parsed
  const { params, body } = resolveParams(parsed.config, choices)
  return { ok: true, config: parsed.config, params, body }
}

export function customHeaders(provider: Provider, model: string): Record<string, string> {
  return parseHeaders(modelConfig(provider, model).headers ?? '').headers
}

/** Model listing isn't tied to a model, so it goes out with the protocol's own headers only. */
export function listModels(provider: Provider, signal?: AbortSignal) {
  return getAdapter(provider.protocol).listModels(provider, {}, signal)
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
export type { ChatMessage, ImagePayload, StreamEvent }

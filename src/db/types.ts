export type Protocol = 'openai-chat' | 'openai-responses' | 'anthropic'

export interface Provider {
  id: string
  name: string
  protocol: Protocol
  baseUrl: string
  apiKey: string
  models: string[]
  /**
   * Fields of earlier replies (beyond the text) to send back as context, e.g. `reasoning_content`,
   * `reasoning_details`; `*` sends every field. Empty/missing: text only. Only applies to replies this
   * provider produced — foreign fields (e.g. another vendor's encrypted reasoning) are never sent.
   */
  echoFields?: string[]
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** Which child is shown at each fork. Key is the parent node id, or ROOT_KEY for top-level nodes. */
  selectedChild: Record<string, string>
}

export const ROOT_KEY = '__root__'

/**
 * 'main' nodes form the conversation tree.
 * 'side' nodes are side questions; a side root's parentId points at the main node it was asked from.
 */
export type NodeKind = 'main' | 'side'

export interface SideAnchor {
  /** Offsets into the assistant content of the anchored node. */
  start: number
  end: number
  text: string
}

export type AttemptStatus = 'streaming' | 'done' | 'error' | 'aborted'

/** A piece of the response body exactly as the network delivered it. */
export interface RawChunk {
  /** Milliseconds since `startedAt`. */
  t: number
  text: string
}

/**
 * Snapshot of the single request this node was produced by, kept exactly as sent and received.
 * `requestHeaders` includes the API key; export must strip it.
 */
export interface Attempt {
  status: AttemptStatus
  providerId: string
  providerName: string
  protocol: Protocol
  model: string
  url: string
  /** Missing on nodes created before raw capture existed. */
  requestHeaders?: Record<string, string>
  requestBody: unknown
  /** Status line and the response headers the browser lets us read (CORS hides the rest). */
  response?: { status: number; statusText: string; headers: Record<string, string> }
  /** Successful (streamed) response body. Error bodies live in `error.body`. */
  rawChunks?: RawChunk[]
  startedAt: number
  /** When the first text or reasoning delta arrived. */
  firstTokenAt?: number
  finishedAt?: number
  /** Raw assistant text exactly as the model returned it (assistant.content may be edited later). */
  rawText: string
  rawReasoning?: string
  /**
   * The reply in its protocol's native shape, unknown vendor fields included
   * (openai-chat: `choices[0].message` merged from the stream). Source for echo-back and reasoning display.
   */
  message?: Record<string, unknown>
  finishReason?: string
  usage?: Record<string, unknown>
  error?: { message: string; status?: number; body?: string; code?: 'network' }
}

export interface ChatNode {
  id: string
  conversationId: string
  parentId: string | null
  kind: NodeKind
  /** Only set on side-question roots. */
  anchor?: SideAnchor
  createdAt: number
  user: { text: string }
  assistant: {
    content: string
    reasoning?: string
    /** True once the user edited the assistant text in place. */
    edited?: boolean
  }
  attempt: Attempt
}

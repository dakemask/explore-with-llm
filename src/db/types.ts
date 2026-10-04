export type Protocol = 'openai-chat' | 'openai-responses' | 'anthropic'

export interface Provider {
  id: string
  name: string
  protocol: Protocol
  baseUrl: string
  apiKey: string
  models: string[]
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

/** Snapshot of the single request this node was produced by. API key is never stored here. */
export interface Attempt {
  status: AttemptStatus
  providerId: string
  providerName: string
  protocol: Protocol
  model: string
  url: string
  requestBody: unknown
  startedAt: number
  finishedAt?: number
  /** Raw assistant text exactly as the model returned it (assistant.content may be edited later). */
  rawText: string
  rawReasoning?: string
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

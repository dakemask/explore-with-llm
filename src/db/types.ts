export type Protocol = 'openai-chat' | 'openai-responses' | 'anthropic'

export interface Provider {
  id: string
  name: string
  protocol: Protocol
  baseUrl: string
  apiKey: string
  /** Model names, in the order shown. */
  models: string[]
  /** Per-model settings, keyed by model name. A model without an entry has none. */
  modelConfigs?: Record<string, ModelConfig>
  createdAt: number
}

/** How requests to one model are made, beyond the protocol's own fields. */
export interface ModelConfig {
  /**
   * Request parameters: the user's JSON config text (format in `lib/params.ts`). Kept as typed so
   * mistakes stay visible; parsed when used.
   */
  params?: string
  /**
   * Send the reasoning of earlier replies back as context. Only applies to replies this provider
   * produced — foreign fields (e.g. another vendor's encrypted reasoning) are never sent.
   */
  echoReasoning?: boolean
  /**
   * With `echoReasoning`: which parts of the native reply to send back — field names (openai-chat),
   * content block types (anthropic) or output item types (openai-responses); `*` = all.
   * Empty/missing: automatic, the reasoning once (see `ProtocolAdapter.echo`).
   */
  echoFields?: string[]
  /** Extra request headers, one `Name: value` per line, sent as typed (may replace built-in ones). */
  headers?: string
  /** The built-in preset (`lib/presets.ts` id) this config was last filled from. */
  preset?: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** Which child is shown at each fork. Key is the parent node id, or ROOT_KEY for top-level nodes. */
  selectedChild: Record<string, string>
  /** The title is final: named by the naming model or by the user, so automatic naming leaves it alone. */
  named?: boolean
  /** Side-question titles made by the naming model, by thread id. Threads without one show a fallback. */
  threadTitles?: Record<string, string>
}

export const ROOT_KEY = '__root__'

/**
 * 'main' nodes form the conversation tree.
 * 'side' nodes are side questions; a side root's parentId points at the main node it was asked from.
 * Every side node carries its `thread`: one side question and its follow-ups. Retrying or editing a
 * side root makes another root with the same thread and anchor (a version, shown by ‹n/m›).
 */
export type NodeKind = 'main' | 'side'

export interface SideAnchor {
  /** Offsets into the assistant content of the anchored node (for notes: into their target text). */
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
 * `requestHeaders` includes the API key; export strips it (`lib/transfer.ts`).
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
   * (openai-chat: `choices[0].message` merged from the stream; anthropic: the message with its content
   * blocks; openai-responses: `{ output }`). Source for echo-back and reasoning display.
   */
  message?: Record<string, unknown>
  finishReason?: string
  usage?: Record<string, unknown>
  error?: { message: string; status?: number; body?: string; code?: 'network' | 'interrupted' }
}

export interface ChatNode {
  id: string
  conversationId: string
  parentId: string | null
  kind: NodeKind
  /** Only set on side-question roots. */
  anchor?: SideAnchor
  /** Side nodes only: the side-question thread they belong to. */
  thread?: string
  /**
   * Main nodes only: a branch (absent = an attempt). Set once the node gets a main child or a side
   * question, or by hand; never unset.
   */
  branch?: true
  /**
   * When the user archived this node (for a side thread: every root version, same time). Descendants are
   * not marked; they are hidden because an ancestor is archived (`lib/tree.ts`).
   */
  archived?: number
  createdAt: number
  user: {
    text: string
    /** Attached images (`StoredImage` ids), sent before the text. Shared with retries / edits that keep them. */
    images?: string[]
  }
  assistant: {
    content: string
    /** Never set on edited nodes: an edit drops the reasoning. */
    reasoning?: string
  }
  /**
   * Set on a node made by editing another node's reply. Its `attempt` is a copy of the source's (shown
   * as the source's in details) and is never echoed; its reasoning is dropped.
   */
  edit?: {
    /** The node whose reply was edited (a sibling). */
    from: string
    /** Earlier versions of the reply, oldest first: the model's reply, then each edit before this one. */
    history: { content: string; at: number }[]
    at: number
  }
  attempt: Attempt
}

/**
 * An image attached to a user message. Stored once per conversation and referenced by id from nodes; the
 * recorded request body holds `[image:<id>]` in place of its base64 data (see `lib/images.ts`).
 */
export interface StoredImage {
  id: string
  conversationId: string
  /** Bytes as sent (already converted / downscaled if the original wasn't sendable). */
  blob: Blob
  mime: string
  width: number
  height: number
  createdAt: number
}

/**
 * The user's own Markdown note on a passage of a main-line node: its reply (`assistant.content`) or its
 * message (`user.text`). Never sent to any model. Belongs to that node only (retries / edits are other
 * nodes); hidden while the node or anything above it is archived.
 */
export interface Note {
  id: string
  conversationId: string
  nodeId: string
  target: 'user' | 'assistant'
  /** Offsets into the target text + the quoted text. */
  anchor: SideAnchor
  text: string
  createdAt: number
  updatedAt: number
  /** When the user archived it (restored from the archive dialog). */
  archived?: number
}

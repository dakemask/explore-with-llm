import { nanoid } from 'nanoid'
import {
  db,
  ROOT_KEY,
  type Attempt,
  type ChatNode,
  type Conversation,
  type Protocol,
  type Provider,
  type RawChunk,
} from '../db'
import { getAdapter, prepareChat, ProviderError, sendChat, type ChatMessage } from '../providers'
import { streamEvents } from './attempt'
import { splitThink } from './reasoning'
import { useUi } from '../store/ui'
import { pathTo } from './tree'

const controllers = new Map<string, AbortController>()

export async function createConversation(): Promise<string> {
  const now = Date.now()
  const conv: Conversation = { id: nanoid(), title: '', createdAt: now, updatedAt: now, selectedChild: {} }
  await db.conversations.add(conv)
  return conv.id
}

export async function renameConversation(id: string, title: string) {
  await db.conversations.update(id, { title })
}

export async function deleteConversation(id: string) {
  await db.transaction('rw', db.conversations, db.nodes, async () => {
    const nodes = await db.nodes.where('conversationId').equals(id).toArray()
    for (const n of nodes) controllers.get(n.id)?.abort()
    await db.nodes.where('conversationId').equals(id).delete()
    await db.conversations.delete(id)
  })
}

/**
 * Turns a root→leaf path into protocol messages, then appends the new user turn.
 * Nodes whose request produced no assistant text still contribute their user turn.
 * Replies carry the native fields `provider` asks to be echoed back (see `Provider.echoFields`).
 */
export function buildMessages(path: ChatNode[], userText: string, provider?: Provider): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (const n of path) {
    messages.push({ role: 'user', content: n.user.text })
    if (n.assistant.content) {
      const extra = provider && echoFields(n, provider)
      messages.push(extra ? { role: 'assistant', content: n.assistant.content, extra } : { role: 'assistant', content: n.assistant.content })
    }
  }
  messages.push({ role: 'user', content: userText })
  return messages
}

/**
 * The native reply fields to send back with `node`'s reply. Only for replies `provider` itself produced:
 * another vendor's fields (encrypted reasoning, signatures…) would be meaningless or rejected.
 * Text always comes from `assistant.content`, so in-place edits win over the original.
 */
function echoFields(node: ChatNode, provider: Provider): Record<string, unknown> | undefined {
  const wanted = provider.echoFields ?? []
  const msg = node.attempt.message
  if (!msg || wanted.length === 0 || node.attempt.providerId !== provider.id) return undefined
  const all = wanted.includes('*')
  const picked = Object.entries(msg).filter(([k]) => k !== 'role' && k !== 'content' && (all || wanted.includes(k)))
  return picked.length ? Object.fromEntries(picked) : undefined
}

/** Rebuilds the native reply message from the recorded stream. */
function nativeReply(protocol: Protocol, chunks: RawChunk[]): Record<string, unknown> | undefined {
  if (chunks.length === 0) return undefined
  try {
    const adapter = getAdapter(protocol)
    const payloads = streamEvents(chunks).flatMap((e) => (e.json === undefined ? [] : [e.json]))
    return adapter.replyMessage(adapter.aggregate(payloads))
  } catch {
    return undefined
  }
}

/**
 * Creates a new node under `parentId` and streams its reply. Retrying or editing a message
 * is the same call with the original node's parent, which makes the new node a sibling.
 */
export async function sendMessage(opts: {
  conversationId: string
  parentId: string | null
  text: string
  provider: Provider
  model: string
}) {
  const { conversationId, parentId, text, provider, model } = opts
  const conv = await db.conversations.get(conversationId)
  if (!conv) return

  const allNodes = await db.nodes.where('conversationId').equals(conversationId).toArray()
  const path = parentId ? pathTo(allNodes, parentId) : []
  const messages = buildMessages(path, text, provider)

  const nodeId = nanoid()
  const now = Date.now()
  const attempt: Attempt = {
    status: 'streaming',
    providerId: provider.id,
    providerName: provider.name,
    protocol: provider.protocol,
    model,
    url: '',
    requestBody: null,
    startedAt: now,
    rawText: '',
  }
  const node: ChatNode = {
    id: nodeId,
    conversationId,
    parentId,
    kind: 'main',
    createdAt: now,
    user: { text },
    assistant: { content: '' },
    attempt,
  }

  await db.transaction('rw', db.nodes, db.conversations, async () => {
    await db.nodes.add(node)
    await db.conversations.update(conversationId, {
      updatedAt: now,
      title: conv.title || summarizeTitle(text),
      selectedChild: { ...conv.selectedChild, [parentId ?? ROOT_KEY]: nodeId },
    })
  })

  await runAttempt(node, provider, model, messages)
}

async function runAttempt(node: ChatNode, provider: Provider, model: string, messages: ChatMessage[]) {
  const setLive = useUi.getState().setLive
  const controller = new AbortController()
  controllers.set(node.id, controller)

  let content = ''
  let reasoning = ''
  let finishReason: string | undefined
  let usage: Record<string, unknown> | undefined
  let firstTokenAt: number | undefined
  let response: Attempt['response']
  const rawChunks: RawChunk[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  /** Text as displayed: `<think>` blocks in the content move to reasoning. */
  const visible = () => {
    const split = splitThink(content)
    return { content: split.content, reasoning: reasoning || split.reasoning }
  }
  const flush = () => {
    flushTimer = null
    setLive(node.id, visible())
  }
  setLive(node.id, visible())

  const finish = async (patch: Partial<Attempt>) => {
    if (flushTimer) clearTimeout(flushTimer)
    controllers.delete(node.id)
    const shown = visible()
    await db.nodes.update(node.id, {
      assistant: { content: shown.content, reasoning: shown.reasoning || undefined },
      attempt: {
        ...node.attempt,
        ...patch,
        rawText: content,
        rawReasoning: reasoning || undefined,
        finishReason,
        usage,
        firstTokenAt,
        response,
        rawChunks: rawChunks.length ? rawChunks : undefined,
        message: nativeReply(provider.protocol, rawChunks),
        finishedAt: Date.now(),
      },
    })
    setLive(node.id, null)
  }

  try {
    const req = prepareChat(provider, model, messages)
    node.attempt = { ...node.attempt, url: req.url, requestHeaders: req.headers, requestBody: req.body }
    await db.nodes.update(node.id, { attempt: node.attempt })

    const startedAt = node.attempt.startedAt
    const events = await sendChat(provider, req, controller.signal, {
      onResponse: (r) => (response = r),
      onChunk: (text) => rawChunks.push({ t: Date.now() - startedAt, text }),
    })
    for await (const ev of events) {
      if (ev.type === 'text') content += ev.delta
      else if (ev.type === 'reasoning') reasoning += ev.delta
      else if (ev.type === 'finish') finishReason = ev.reason
      else if (ev.type === 'usage') usage = ev.usage
      if (ev.type === 'text' || ev.type === 'reasoning') {
        firstTokenAt ??= Date.now()
        if (!flushTimer) flushTimer = setTimeout(flush, 40)
      }
    }
    await finish({ status: 'done' })
  } catch (e) {
    if (controller.signal.aborted) {
      await finish({ status: 'aborted' })
    } else {
      const err = e instanceof ProviderError ? e : new ProviderError((e as Error)?.message ?? String(e))
      await finish({ status: 'error', error: { message: err.message, status: err.status, body: err.body, code: err.code } })
    }
  }
}

/** Shows `nodeId` at its fork; descendants follow their own remembered selections. */
export async function selectBranch(conversationId: string, parentId: string | null, nodeId: string) {
  await db.conversations.update(conversationId, { [`selectedChild.${parentId ?? ROOT_KEY}`]: nodeId })
}

export function stopGeneration(nodeId: string) {
  controllers.get(nodeId)?.abort()
}

function summarizeTitle(text: string) {
  const line = text.trim().split('\n')[0]
  return line.length > 40 ? line.slice(0, 40) + '…' : line
}

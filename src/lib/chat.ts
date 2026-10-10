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
  type ThreadAnchor,
} from '../db'
import { translate } from '../i18n'
import { getAdapter, modelConfig, modelParams, prepareChat, ProviderError, sendChat, type ChatMessage, type ImagePayload } from '../providers'
import { paramKey, useSettings } from '../store/settings'
import { streamEvents } from './attempt'
import { loadPayloads, maskImages, pruneImages, saveImages, type ImageFile } from './images'
import { copyRecords, deleteRecords, responseSize, saveRequest, saveResponse } from './records'
import { splitThink } from './reasoning'
import { useUi } from '../store/ui'
import { afterReply, fallbackTitle, namingModel, needsName, titleKey } from './naming'
import { busyIds, childrenOf, forkKey, pathTo, subtreeIds, threadRoots } from './tree'

const controllers = new Map<string, AbortController>()

export async function createConversation(): Promise<string> {
  const now = Date.now()
  const conv: Conversation = { id: nanoid(), title: '', createdAt: now, updatedAt: now, selectedChild: {} }
  await db.conversations.add(conv)
  return conv.id
}

export async function renameConversation(id: string, title: string) {
  await db.conversations.update(id, { title, named: true })
}

/** A side question's title, set by the user (a thread with a title is never named automatically). */
export async function renameThread(conversationId: string, thread: string, title: string) {
  await db.conversations.update(conversationId, { [`threadTitles.${thread}`]: title })
}

export async function deleteConversation(id: string) {
  await db.transaction('rw', [db.conversations, db.nodes, db.images, db.notes, db.requests, db.responses, db.merged], async () => {
    const nodes = await db.nodes.where('conversationId').equals(id).toArray()
    for (const n of nodes) controllers.get(n.id)?.abort()
    await db.nodes.where('conversationId').equals(id).delete()
    await db.requests.where('conversationId').equals(id).delete()
    await db.responses.where('conversationId').equals(id).delete()
    await db.merged.where('conversationId').equals(id).delete()
    await db.notes.where('conversationId').equals(id).delete()
    await db.conversations.delete(id)
    await db.images.where('conversationId').equals(id).delete()
  })
}

/**
 * Turns a root→leaf path into protocol messages, then appends the new user turn.
 * Nodes whose request produced no assistant text still contribute their user turn.
 * Replies carry the native fields the target model's config asks to be echoed back (see `ModelConfig.echoFields`).
 * `images` supplies the data of every image the user turns refer to (`ChatNode.user.images`, `images.user`).
 * `system` (the path's first node's, or the new first turn's) goes first.
 */
export function buildMessages(
  path: ChatNode[],
  userText: string,
  target?: { provider: Provider; model: string },
  images?: { payloads: Map<string, ImagePayload>; user: string[] },
  system = path[0]?.system,
): ChatMessage[] {
  const userTurn = (content: string, ids: string[] | undefined): ChatMessage => {
    const found = (ids ?? []).flatMap((id) => images?.payloads.get(id) ?? [])
    return found.length ? { role: 'user', content, images: found } : { role: 'user', content }
  }
  const messages: ChatMessage[] = system ? [{ role: 'system', content: system }] : []
  for (const n of path) {
    messages.push(userTurn(n.user.text, n.user.images))
    if (n.assistant.content) {
      const extra = target && echoFields(n, target.provider, target.model)
      messages.push(extra ? { role: 'assistant', content: n.assistant.content, extra } : { role: 'assistant', content: n.assistant.content })
    }
  }
  messages.push(userTurn(userText, images?.user))
  return messages
}

/**
 * The native reply fields to send back with `node`'s reply. Only for replies `provider` itself produced:
 * another vendor's fields (encrypted reasoning, signatures…) would be meaningless or rejected.
 * Text always comes from `assistant.content`, so in-place edits win over the original.
 */
function echoFields(node: ChatNode, provider: Provider, model: string): Record<string, unknown> | undefined {
  const msg = node.attempt.message
  const config = modelConfig(provider, model)
  // An edited reply has no reasoning of its own; the copied source's would not match the new text.
  if (!msg || node.edit || !config.echoReasoning || node.attempt.providerId !== provider.id) return undefined
  // A reply from before a protocol switch has another protocol's shape; it can't be echoed.
  if (node.attempt.protocol !== provider.protocol) return undefined
  return getAdapter(provider.protocol).echo(msg, config.echoFields ?? [])
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
 * `side` makes it a side-question node in `thread`; `anchor` makes it a thread root.
 */
export async function sendMessage(opts: {
  conversationId: string
  parentId: string | null
  text: string
  /** Images sent with the text (new ones are stored; retries pass the original's). */
  images?: ImageFile[]
  provider: Provider
  model: string
  side?: { thread: string; anchor?: ThreadAnchor }
  /** A new first turn's system message (empty: none); other turns use their path's first node's. */
  system?: string
}) {
  const { conversationId, parentId, text, provider, model, side } = opts
  const images = opts.images ?? []
  const conv = await db.conversations.get(conversationId)
  if (!conv) return

  await saveImages(conversationId, images)
  const allNodes = await db.nodes.where('conversationId').equals(conversationId).toArray()
  const path = parentId ? pathTo(allNodes, parentId) : []
  const imageIds = images.map((i) => i.id)
  const payloads = await loadPayloads([...path.flatMap((n) => n.user.images ?? []), ...imageIds])
  const system = !parentId && !side && opts.system ? opts.system : undefined
  const messages = buildMessages(path, text, { provider, model }, { payloads, user: imageIds }, parentId ? path[0]?.system : system)

  const nodeId = nanoid()
  const now = Date.now()
  const attempt: Attempt = {
    status: 'streaming',
    providerId: provider.id,
    providerName: provider.name,
    protocol: provider.protocol,
    model,
    url: '',
    startedAt: now,
    rawText: '',
  }
  const node: ChatNode = {
    id: nodeId,
    conversationId,
    parentId,
    kind: side ? 'side' : 'main',
    ...(side && { thread: side.thread }),
    ...(side?.anchor && { anchor: side.anchor }),
    ...(system && { system }),
    createdAt: now,
    user: imageIds.length ? { text, images: imageIds } : { text },
    assistant: { content: '' },
    attempt,
  }

  // With a naming model, the title waits for the reply (a loading animation shows meanwhile); else the first line.
  const titleFor = titleKey(node)
  const naming = !!titleFor && !!namingModel(await db.providers.toArray()) && (await needsName(node))
  if (naming) useUi.getState().setNaming(titleFor, true)
  let promoted: string | undefined
  await db.transaction('rw', db.nodes, db.conversations, async () => {
    await db.nodes.add(node)
    // A follow-up or a side question makes the main node it was sent from a branch.
    if (parentId && (!side || side.anchor)) {
      const parent = await db.nodes.get(parentId)
      if (parent?.kind === 'main' && !parent.branch) {
        await db.nodes.update(parentId, { branch: true, branchAt: Date.now() })
        promoted = parentId
      }
    }
    await db.conversations.update(conversationId, {
      updatedAt: now,
      title: conv.title || (naming ? '' : fallbackTitle(text, images.length, useSettings.getState().lang)),
      selectedChild: { ...conv.selectedChild, [forkKey(node)]: nodeId },
    })
  })

  if (promoted) useUi.getState().markBranches([promoted])

  await runAttempt(node, path, provider, model, messages, payloads.values())
  await afterReply(nodeId)
}

async function runAttempt(
  node: ChatNode,
  path: ChatNode[],
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  images: Iterable<ImagePayload>,
) {
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
    const attempt: Attempt = {
      ...node.attempt,
      ...patch,
      rawText: content,
      rawReasoning: reasoning || undefined,
      finishReason,
      usage,
      firstTokenAt,
      response,
      responseSize: rawChunks.length ? responseSize(rawChunks) : undefined,
      message: nativeReply(provider.protocol, rawChunks),
      finishedAt: Date.now(),
    }
    if (rawChunks.length) await saveResponse(node, rawChunks, attempt)
    await db.nodes.update(node.id, { assistant: { content: shown.content, reasoning: shown.reasoning || undefined }, attempt })
    // The live text is dropped by the message once the stored node shows the reply is over (MessageNode).
  }

  try {
    const { lang, paramChoices } = useSettings.getState()
    const params = modelParams(provider, model, paramChoices[paramKey(provider.id, model)])
    if (!params.ok) throw new ProviderError(translate(lang, 'params.invalid'))
    const req = prepareChat(provider, model, messages, params.body)
    // Recorded before the node says it was sent, so details opened from then on find it.
    await saveRequest(node, { headers: req.headers, body: maskImages(req.body, images) }, path)
    node.attempt = { ...node.attempt, url: req.url }
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
    const shown = visible()
    if (!shown.content.trim() && !shown.reasoning.trim()) throw new ProviderError(translate(useSettings.getState().lang, 'error.empty'))
    await finish({ status: 'done' })
  } catch (e) {
    if (controller.signal.aborted) {
      await finish({ status: 'aborted' })
    } else {
      // Anything else thrown after the response arrived is the body stream failing (e.g. the connection dropped).
      const err =
        e instanceof ProviderError
          ? e
          : new ProviderError((e as Error)?.message ?? String(e), undefined, undefined, response ? 'interrupted' : undefined)
      await finish({ status: 'error', error: { message: err.message, status: err.status, body: err.body, code: err.code } })
    }
  }
}

/**
 * A new version of `node` (retry, or edited question): a sibling at the same fork, same thread/anchor. A first
 * turn keeps its system message unless `system` gives another one.
 */
export function resend(node: ChatNode, text: string, images: ImageFile[], provider: Provider, model: string, system = node.system) {
  return sendMessage({
    conversationId: node.conversationId,
    parentId: node.parentId,
    text,
    images,
    provider,
    model,
    side: node.thread ? { thread: node.thread, anchor: node.anchor } : undefined,
    system,
  })
}

/**
 * Shows `nodeId` at its fork (see `forkKey`); descendants follow their own remembered selections. Shown at
 * once (`useUi().pick`), before the write lands.
 */
export async function selectBranch(conversationId: string, key: string | null, nodeId: string) {
  useUi.getState().pick(conversationId, { [key ?? ROOT_KEY]: nodeId })
  await db.conversations.update(conversationId, { [`selectedChild.${key ?? ROOT_KEY}`]: nodeId })
}

/** Remembers several fork selections at once (fork key → node id), in one write. */
export async function selectPath(conversationId: string, selection: Record<string, string>) {
  useUi.getState().pick(conversationId, selection)
  await db.conversations.update(
    conversationId,
    Object.fromEntries(Object.entries(selection).map(([key, id]) => [`selectedChild.${key}`, id])),
  )
}

/** Turns an attempt into a branch (by hand). Never undone. */
export async function makeBranch(nodeId: string) {
  await db.nodes.update(nodeId, { branch: true, branchAt: Date.now() })
  useUi.getState().markBranches([nodeId])
}

/**
 * Turns a side question into main nodes under the node it was asked from (never undone). Every root version
 * and follow-up becomes a main node; a single root version is a branch, several: only those with follow-ups,
 * the rest attempts; follow-ups are branches once followed up. The thread's title becomes the shown root's
 * label; its anchor, title and remembered version go. What's shown at the fork is pinned first, so the view
 * doesn't switch (asked from the last turn, there is nothing to pin: the thread continues the path).
 * Context is unchanged: a side thread's context already was the main path + the thread. False: nothing
 * done (gone, or something in it is streaming).
 */
export async function threadToBranch(conversationId: string, thread: string): Promise<boolean> {
  const promoted: string[] = []
  let done = false
  await db.transaction('rw', db.conversations, db.nodes, async () => {
    const conv = await db.conversations.get(conversationId)
    const nodes = await db.nodes.where('conversationId').equals(conversationId).toArray()
    const roots = threadRoots(nodes, thread)
    if (!conv || !roots.length || roots.some((r) => busyIds(nodes).has(r.id))) return
    const parentId = roots[0].parentId
    const key = parentId ?? ROOT_KEY
    const shownRoot = roots.find((r) => r.id === conv.selectedChild[thread]) ?? roots[roots.length - 1]
    const kids = childrenOf(nodes, parentId)
    const shown = kids.find((k) => k.id === conv.selectedChild[key]) ?? kids[kids.length - 1] ?? shownRoot
    const members = nodes.filter((n) => n.thread === thread)
    const hasKids = new Set(members.map((n) => n.parentId))
    const title = conv.threadTitles?.[thread]
    const now = Date.now()
    for (const n of members) {
      const branch = n.anchor ? roots.length === 1 || hasKids.has(n.id) : hasKids.has(n.id)
      if (branch && !n.archived) promoted.push(n.id)
      await db.nodes
        .where(':id')
        .equals(n.id)
        .modify((m) => {
          m.kind = 'main'
          delete m.thread
          delete m.anchor
          if (branch) Object.assign(m, { branch: true, branchAt: now })
          if (m.id === shownRoot.id && title) m.label = title
        })
    }
    const selectedChild = { ...conv.selectedChild, [key]: shown.id }
    delete selectedChild[thread]
    const threadTitles = { ...conv.threadTitles }
    delete threadTitles[thread]
    await db.conversations.update(conversationId, { selectedChild, threadTitles })
    done = true
  })
  useUi.getState().markBranches(promoted)
  return done
}

/** Sets a main node's label (`ChatNode.label`); an empty one removes it. */
export async function setLabel(nodeId: string, label: string) {
  const text = label.trim()
  await db.nodes
    .where(':id')
    .equals(nodeId)
    .modify((n) => {
      if (text) n.label = text
      else delete n.label
    })
}

/** Archives a main node (with everything below it, which stays unmarked but hidden). */
export async function archiveNode(nodeId: string) {
  await db.nodes.update(nodeId, { archived: Date.now() })
}

/** Archives a side question as a whole: every root version of `thread`, with the same time. */
export async function archiveThread(conversationId: string, thread: string) {
  const at = Date.now()
  await db.nodes
    .where('conversationId')
    .equals(conversationId)
    .filter((n) => n.thread === thread && !!n.anchor)
    .modify({ archived: at })
}

/**
 * Restores an archive entry (`ArchivedItem.nodes`): they return to whatever kind they had. What's shown at
 * the restored node's fork is pinned first, so restoring never switches the view.
 */
export async function restoreArchived(conversationId: string, nodeIds: string[]) {
  await db.transaction('rw', db.conversations, db.nodes, async () => {
    const conv = await db.conversations.get(conversationId)
    const first = await db.nodes.get(nodeIds[0])
    if (conv && first && first.kind === 'main') {
      const nodes = await db.nodes.where('conversationId').equals(conversationId).toArray()
      const key = forkKey(first)
      const kids = childrenOf(nodes, first.parentId)
      const shown = kids.find((k) => k.id === conv.selectedChild[key]) ?? kids[kids.length - 1]
      if (shown) await db.conversations.update(conversationId, { [`selectedChild.${key}`]: shown.id })
    }
    await db.nodes
      .where(':id')
      .anyOf(nodeIds)
      .modify((n) => {
        delete n.archived
      })
  })
}

/**
 * Deletes an archive entry forever: `nodeIds` and everything below them (main nodes, side threads, archived
 * or not), the notes on them, the remembered selections and titles of what's gone, and images nothing refers
 * to any more.
 */
export async function deleteArchived(conversationId: string, nodeIds: string[]) {
  await db.transaction('rw', [db.conversations, db.nodes, db.images, db.notes, db.requests, db.responses, db.merged], async () => {
    const nodes = await db.nodes.where('conversationId').equals(conversationId).toArray()
    const ids = subtreeIds(nodes, nodeIds)
    for (const id of ids) controllers.get(id)?.abort()
    await db.nodes.bulkDelete([...ids])
    await deleteRecords([...ids])
    await db.notes.where('nodeId').anyOf([...ids]).delete()
    const conv = await db.conversations.get(conversationId)
    if (conv) {
      const threads = new Set(nodes.flatMap((n) => (ids.has(n.id) && n.thread ? [n.thread] : [])))
      const selectedChild = Object.fromEntries(
        Object.entries(conv.selectedChild).filter(([k, v]) => !ids.has(k) && !ids.has(v) && !threads.has(k)),
      )
      const threadTitles = Object.fromEntries(Object.entries(conv.threadTitles ?? {}).filter(([k]) => !threads.has(k)))
      await db.conversations.update(conversationId, { selectedChild, threadTitles })
    }
    await pruneImages(conversationId)
  })
}

/**
 * Edits `node`'s reply: a new sibling (same fork, thread and anchor) with the edited text and no
 * reasoning, carrying a copy of the source's request and response (records included), and shown in its place.
 */
export async function editAssistant(node: ChatNode, content: string): Promise<string> {
  const now = Date.now()
  const replyAt = node.attempt.finishedAt ?? node.attempt.startedAt
  const id = nanoid()
  const edited: ChatNode = {
    id,
    conversationId: node.conversationId,
    parentId: node.parentId,
    kind: node.kind,
    ...(node.thread && { thread: node.thread }),
    ...(node.anchor && { anchor: node.anchor }),
    ...(node.system && { system: node.system }),
    createdAt: now,
    user: node.user,
    assistant: { content },
    edit: {
      from: node.id,
      history: [...(node.edit?.history ?? []), { content: node.assistant.content, at: node.edit?.at ?? replyAt }],
      at: now,
    },
    attempt: node.attempt,
  }
  await db.transaction('rw', [db.nodes, db.conversations, db.requests, db.responses, db.merged], async () => {
    await db.nodes.add(edited)
    await copyRecords(node.id, edited)
    await db.conversations.update(node.conversationId, { [`selectedChild.${forkKey(node)}`]: id })
    await db.conversations.update(node.conversationId, { updatedAt: now })
  })
  return id
}

export function stopGeneration(nodeId: string) {
  controllers.get(nodeId)?.abort()
}

/**
 * The node finished without reply text (failed, stopped early, reasoning only). Nothing can follow it:
 * its user message would go out with no answer after it, so the composer offers a regenerate instead.
 */
export function lacksReply(node: ChatNode | undefined): node is ChatNode {
  return !!node && node.attempt.status !== 'streaming' && !node.assistant.content.trim()
}

export interface ReplyVersion {
  content: string
  at: number
  kind: 'current' | 'edit' | 'original'
}

/** Every version of an edited reply, newest (this node's) first, down to the model's original. */
export function replyVersions(node: ChatNode): ReplyVersion[] {
  if (!node.edit) return []
  const earlier = node.edit.history.map((v, i) => ({ ...v, kind: i === 0 ? ('original' as const) : ('edit' as const) }))
  return [...earlier, { content: node.assistant.content, at: node.edit.at, kind: 'current' as const }].reverse()
}

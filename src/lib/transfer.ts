import { nanoid } from 'nanoid'
import { db, ROOT_KEY, type ChatNode, type Conversation, type StoredImage } from '../db'
import { SECRET_HEADER } from './attempt'
import { imageMarker } from './images'

/**
 * Single-conversation backup: the conversation, every node (all branches, side questions and edited
 * versions, raw request records included) and its images as base64. API keys are removed.
 */
export interface ConversationFile {
  format: typeof FORMAT
  version: 1
  exportedAt: number
  conversation: Conversation
  nodes: ChatNode[]
  images: (Omit<StoredImage, 'blob'> & { data: string })[]
}

const FORMAT = 'explore-with-llm/conversation'
export const REMOVED = '[removed]'

export class ImportError extends Error {}

export async function exportConversation(id: string): Promise<{ name: string; json: string }> {
  const conversation = await db.conversations.get(id)
  if (!conversation) throw new Error('conversation not found')
  const nodes = await db.nodes.where('conversationId').equals(id).toArray()
  const images = await db.images.where('conversationId').equals(id).toArray()
  const keys = (await db.providers.toArray()).map((p) => p.apiKey)
  const file: ConversationFile = {
    format: FORMAT,
    version: 1,
    exportedAt: Date.now(),
    conversation,
    nodes: stripSecrets(nodes, keys),
    images: await Promise.all(
      images.map(async ({ blob, ...rest }) => ({ ...rest, data: await blobToBase64(blob) })),
    ),
  }
  return { name: fileName(conversation), json: JSON.stringify(file, null, 2) }
}

/**
 * Removes credentials: values of credential-like request headers, and any occurrence of a known API key
 * (or of those header values) anywhere else in the nodes — custom headers, URLs, error bodies.
 */
export function stripSecrets(nodes: ChatNode[], apiKeys: string[]): ChatNode[] {
  const secrets = new Set(apiKeys.filter((k) => k.trim().length >= 8))
  for (const n of nodes)
    for (const [k, v] of Object.entries(n.attempt.requestHeaders ?? {})) {
      if (!SECRET_HEADER.test(k)) continue
      const value = v.replace(/^(Bearer|Basic|Token)\s+/i, '')
      if (value.length >= 8) secrets.add(value)
    }
  const list = [...secrets].sort((a, b) => b.length - a.length)
  const scrub = (s: string) => list.reduce((acc, k) => (acc.includes(k) ? acc.split(k).join(REMOVED) : acc), s)
  return nodes.map((n) => {
    const out = mapStrings(n, scrub) as ChatNode
    if (out.attempt.requestHeaders)
      out.attempt.requestHeaders = Object.fromEntries(
        Object.entries(out.attempt.requestHeaders).map(([k, v]) => [k, SECRET_HEADER.test(k) ? REMOVED : v]),
      )
    return out
  })
}

/**
 * Adds the conversation in `text` (an exported file) as a new conversation and returns its id. Every id
 * is new, so importing the same file twice gives two independent copies.
 */
export async function importConversation(text: string): Promise<string> {
  const file = parseFile(text)
  const ids = new Map<string, string>()
  const remap = (old: string) => {
    let id = ids.get(old)
    if (!id) ids.set(old, (id = nanoid()))
    return id
  }
  const imageIds = new Map(file.images.map((i) => [i.id, remap(i.id)]))
  const fixMarkers = (s: string) => {
    if (!s.includes('[image:')) return s
    for (const [o, n] of imageIds) if (s.includes(imageMarker(o))) s = s.split(imageMarker(o)).join(imageMarker(n))
    return s
  }

  const now = Date.now()
  const convId = nanoid()
  const conversation: Conversation = {
    id: convId,
    title: file.conversation.title,
    createdAt: file.conversation.createdAt,
    updatedAt: now,
    selectedChild: Object.fromEntries(
      Object.entries(file.conversation.selectedChild).map(([k, v]) => [k === ROOT_KEY ? k : remap(k), remap(v)]),
    ),
  }
  const nodes: ChatNode[] = file.nodes.map((n) => ({
    ...n,
    id: remap(n.id),
    conversationId: convId,
    parentId: n.parentId === null ? null : remap(n.parentId),
    ...(n.thread && { thread: remap(n.thread) }),
    user: { ...n.user, ...(n.user.images && { images: n.user.images.map(remap) }) },
    ...(n.edit && { edit: { ...n.edit, from: remap(n.edit.from) } }),
    attempt: {
      ...n.attempt,
      // A reply that was still streaming when exported never finished.
      ...(n.attempt.status === 'streaming' && { status: 'aborted' as const }),
      requestBody: mapStrings(n.attempt.requestBody, fixMarkers),
    },
  }))
  const images: StoredImage[] = file.images.map(({ data, ...i }) => ({
    ...i,
    id: imageIds.get(i.id)!,
    conversationId: convId,
    blob: base64ToBlob(data, i.mime),
  }))

  await db.transaction('rw', db.conversations, db.nodes, db.images, async () => {
    await db.conversations.add(conversation)
    await db.nodes.bulkAdd(nodes)
    if (images.length) await db.images.bulkAdd(images)
  })
  return convId
}

/** Checks the file is an exported conversation whose references hold together. */
function parseFile(text: string): ConversationFile {
  let f: any
  try {
    f = JSON.parse(text)
  } catch {
    throw new ImportError('not JSON')
  }
  if (!f || f.format !== FORMAT) throw new ImportError('not an exported conversation')
  if (f.version !== 1) throw new ImportError(`unsupported version ${f.version}`)
  const c = f.conversation
  if (!c || typeof c.title !== 'string' || !isRecord(c.selectedChild) || !Array.isArray(f.nodes) || !Array.isArray(f.images))
    throw new ImportError('missing fields')
  const nodeIds = new Set<string>()
  for (const n of f.nodes) {
    if (!isRecord(n) || typeof n.id !== 'string' || !isRecord(n.user) || typeof n.user.text !== 'string')
      throw new ImportError('bad message')
    if (!isRecord(n.assistant) || typeof n.assistant.content !== 'string' || !isRecord(n.attempt))
      throw new ImportError('bad message')
    if (n.kind !== 'main' && n.kind !== 'side') throw new ImportError('bad message')
    nodeIds.add(n.id)
  }
  const imageIds = new Set<string>()
  for (const i of f.images) {
    if (!isRecord(i) || typeof i.id !== 'string' || typeof i.data !== 'string' || !/^image\//.test(i.mime))
      throw new ImportError('bad image')
    imageIds.add(i.id)
  }
  for (const n of f.nodes) {
    if (n.parentId !== null && !nodeIds.has(n.parentId)) throw new ImportError('broken message tree')
    if (n.kind === 'side' && typeof n.thread !== 'string') throw new ImportError('broken message tree')
    if (n.user.images && (!Array.isArray(n.user.images) || n.user.images.some((id: unknown) => !imageIds.has(id as string))))
      throw new ImportError('missing image')
  }
  return f as ConversationFile
}

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Deep copy of `v` with every string passed through `fn`. */
function mapStrings(v: unknown, fn: (s: string) => string): unknown {
  if (typeof v === 'string') return fn(v)
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn))
  if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)]))
  return v
}

function fileName(c: Conversation) {
  const title = (c.title || 'conversation').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 60)
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${title}-${date}.json`
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function base64ToBlob(data: string, mime: string): Blob {
  let bin: string
  try {
    bin = atob(data)
  } catch {
    throw new ImportError('bad image')
  }
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Saves `text` as a download. */
export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

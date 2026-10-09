import { nanoid } from 'nanoid'
import { db, ROOT_KEY, type ChatNode, type Conversation, type Note, type RawChunk, type StoredImage, type StoredRecord } from '../db'
import { SECRET_HEADER } from './attempt'
import { imageMarker } from './images'
import { gunzip, gzip, remapRefs, splitNode, type PackedRequest } from './records'
import { deriveBranches, pathTo } from './tree'

/**
 * Single-conversation backup: the conversation, every node (all branches, side questions and edited
 * versions, raw request records included) and its images as base64. API keys are removed.
 */
export interface ConversationFile {
  format: typeof FORMAT
  /**
   * 1: before node kinds (no `branch` / `archived`; branches are derived on import). 2: before notes. 3: before labels.
   * 4: before system messages (none was sent). 5: before note titles. 6: request and raw response inside each
   * node's `attempt` (`requestHeaders`, `requestBody`, `rawChunks`).
   */
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7
  exportedAt: number
  conversation: Conversation
  nodes: ChatNode[]
  images: (Omit<StoredImage, 'blob'> & { data: string })[]
  /** Since version 3. */
  notes?: Note[]
  /**
   * Since version 7: each node's stored request (`PackedRequest`) and raw response (`RawChunk[]`) as in the
   * browser — gzip-compressed JSON, here in base64 (`lib/records.ts`).
   */
  records?: { node: string; request?: string; response?: string }[]
}

const FORMAT = 'explore-with-llm/conversation'
const VERSION = 7
export const REMOVED = '[removed]'

export class ImportError extends Error {}

export async function exportConversation(id: string): Promise<{ name: string; json: string }> {
  const conversation = await db.conversations.get(id)
  if (!conversation) throw new Error('conversation not found')
  const nodes = await db.nodes.where('conversationId').equals(id).toArray()
  const images = await db.images.where('conversationId').equals(id).toArray()
  const notes = await db.notes.where('conversationId').equals(id).toArray()
  const requests = await decodeRows<PackedRequest>(await db.requests.where('conversationId').equals(id).toArray())
  const responses = await decodeRows<RawChunk[]>(await db.responses.where('conversationId').equals(id).toArray())
  const keys = (await db.providers.toArray()).map((p) => p.apiKey)
  const scrub = scrubber(keys, [...requests.values()])
  const records = await Promise.all(
    nodes
      .filter((n) => requests.has(n.id) || responses.has(n.id))
      .map(async (n) => {
        const req = requests.get(n.id)
        const res = responses.get(n.id)
        return {
          node: n.id,
          ...(req && { request: bytesToBase64(await gzip(stripRequest(req, scrub))) }),
          ...(res && { response: bytesToBase64(await gzip(mapStrings(res, scrub))) }),
        }
      }),
  )
  const file: ConversationFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    conversation,
    nodes: nodes.map((n) => mapStrings(n, scrub) as ChatNode),
    images: await Promise.all(
      images.map(async ({ blob, ...rest }) => ({ ...rest, data: await blobToBase64(blob) })),
    ),
    notes,
    records,
  }
  return { name: fileName(conversation), json: JSON.stringify(file, null, 2) }
}

async function decodeRows<T>(rows: StoredRecord[]): Promise<Map<string, T>> {
  return new Map(await Promise.all(rows.map(async (r) => [r.id, (await gunzip(r.data)) as T] as const)))
}

/**
 * Removes credentials: any occurrence of a known API key, or of a credential-like request header's value,
 * anywhere (custom headers, URLs, error bodies…). `stripRequest` also blanks those headers' values.
 */
function scrubber(apiKeys: string[], requests: PackedRequest[]): (s: string) => string {
  const secrets = new Set(apiKeys.filter((k) => k.trim().length >= 8))
  for (const r of requests)
    for (const [k, v] of Object.entries(r.headers ?? {})) {
      if (!SECRET_HEADER.test(k)) continue
      const value = v.replace(/^(Bearer|Basic|Token)\s+/i, '')
      if (value.length >= 8) secrets.add(value)
    }
  const list = [...secrets].sort((a, b) => b.length - a.length)
  return (s) => list.reduce((acc, k) => (acc.includes(k) ? acc.split(k).join(REMOVED) : acc), s)
}

function stripRequest(r: PackedRequest, scrub: (s: string) => string): PackedRequest {
  const out = mapStrings(r, scrub) as PackedRequest
  if (out.headers)
    out.headers = Object.fromEntries(Object.entries(out.headers).map(([k, v]) => [k, SECRET_HEADER.test(k) ? REMOVED : v]))
  return out
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
    ...(file.conversation.named && { named: true }),
    ...(isRecord(file.conversation.threadTitles) && {
      threadTitles: Object.fromEntries(
        Object.entries(file.conversation.threadTitles).flatMap(([k, v]) => (typeof v === 'string' ? [[remap(k), v]] : [])),
      ),
    }),
  }
  let nodes: ChatNode[] = (file.version === 1 ? deriveBranches(file.nodes) : file.nodes).map((n) => ({
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
    },
  }))

  // Each node's request (image markers and pointers moved to the new ids) and raw response, compressed.
  const requests: StoredRecord[] = []
  const responses: StoredRecord[] = []
  const add = async (nodeId: string, req: PackedRequest | undefined, chunks: RawChunk[] | undefined) => {
    if (req) requests.push({ id: nodeId, conversationId: convId, data: await gzip(mapStrings(req, fixMarkers)) })
    if (chunks) responses.push({ id: nodeId, conversationId: convId, data: await gzip(chunks) })
  }
  if (file.version >= 7) {
    for (const r of file.records ?? []) {
      const req = r.request ? remapRefs((await decodeRecord(r.request)) as PackedRequest, remap) : undefined
      const chunks = r.response ? ((await decodeRecord(r.response)) as RawChunk[]) : undefined
      await add(remap(r.node), req, chunks)
    }
  } else {
    // Older files carry them inside each node, as the browser did before DB v7.
    const parts = nodes.map((n) => splitNode(n, n.parentId ? pathTo(nodes, n.parentId) : []))
    nodes = parts.map((p) => p.node)
    for (const p of parts) await add(p.node.id, p.request, p.chunks)
  }

  const images: StoredImage[] = file.images.map(({ data, ...i }) => ({
    ...i,
    id: imageIds.get(i.id)!,
    conversationId: convId,
    blob: base64ToBlob(data, i.mime),
  }))
  const notes: Note[] = (file.notes ?? []).map((n) => ({
    ...n,
    id: nanoid(),
    conversationId: convId,
    nodeId: remap(n.nodeId),
  }))

  await db.transaction('rw', [db.conversations, db.nodes, db.images, db.notes, db.requests, db.responses], async () => {
    await db.conversations.add(conversation)
    await db.nodes.bulkAdd(nodes)
    if (images.length) await db.images.bulkAdd(images)
    if (notes.length) await db.notes.bulkAdd(notes)
    if (requests.length) await db.requests.bulkAdd(requests)
    if (responses.length) await db.responses.bulkAdd(responses)
  })
  return convId
}

async function decodeRecord(base64: string): Promise<unknown> {
  try {
    return await gunzip(base64ToBytes(base64))
  } catch {
    throw new ImportError('bad record')
  }
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
  if (![1, 2, 3, 4, 5, 6, 7].includes(f.version)) throw new ImportError(`unsupported version ${f.version}`)
  const c = f.conversation
  if (!c || typeof c.title !== 'string' || !isRecord(c.selectedChild) || !Array.isArray(f.nodes) || !Array.isArray(f.images))
    throw new ImportError('missing fields')
  if (f.version >= 3 ? !Array.isArray(f.notes) : f.notes !== undefined) throw new ImportError('missing fields')
  if (f.version >= 7 ? !Array.isArray(f.records) : f.records !== undefined) throw new ImportError('missing fields')
  const nodeIds = new Set<string>()
  for (const n of f.nodes) {
    if (!isRecord(n) || typeof n.id !== 'string' || !isRecord(n.user) || typeof n.user.text !== 'string')
      throw new ImportError('bad message')
    if (!isRecord(n.assistant) || typeof n.assistant.content !== 'string' || !isRecord(n.attempt))
      throw new ImportError('bad message')
    if (n.kind !== 'main' && n.kind !== 'side') throw new ImportError('bad message')
    if ((n.branch !== undefined && n.branch !== true) || (n.archived !== undefined && typeof n.archived !== 'number'))
      throw new ImportError('bad message')
    if (n.label !== undefined && typeof n.label !== 'string') throw new ImportError('bad message')
    if (n.system !== undefined && typeof n.system !== 'string') throw new ImportError('bad message')
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
  for (const n of f.notes ?? []) if (!isNote(n, nodeIds)) throw new ImportError('bad note')
  for (const r of f.records ?? []) {
    const part = (v: unknown) => v === undefined || typeof v === 'string'
    if (!isRecord(r) || !nodeIds.has(r.node) || !part(r.request) || !part(r.response)) throw new ImportError('bad record')
  }
  return f as ConversationFile
}

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

function isNote(n: any, nodeIds: Set<string>) {
  if (!isRecord(n) || typeof n.id !== 'string' || typeof n.text !== 'string' || !nodeIds.has(n.nodeId)) return false
  if (n.target !== 'user' && n.target !== 'assistant') return false
  if (n.title !== undefined && typeof n.title !== 'string') return false
  const a = n.anchor
  if (!isRecord(a) || !isNum(a.start) || !isNum(a.end) || a.end < a.start || typeof a.text !== 'string') return false
  return isNum(n.createdAt) && isNum(n.updatedAt) && (n.archived === undefined || isNum(n.archived))
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

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
}

function base64ToBytes(data: string): Uint8Array {
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function base64ToBlob(data: string, mime: string): Blob {
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(data)
  } catch {
    throw new ImportError('bad image')
  }
  return new Blob([bytes as BlobPart], { type: mime })
}

/** Saves `data` as a download (text: JSON). */
export function download(name: string, data: string | Blob) {
  const blob = typeof data === 'string' ? new Blob([data], { type: 'application/json' }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

import { db, type ChatNode, type Protocol, type RawChunk, type StoredRecord } from '../db'
import { aggregateStream } from '../providers'
import { streamEvents } from './attempt'

/**
 * A node's request and raw response, stored apart from the node (DB v7): reading a conversation reads neither.
 * The request (headers with the API key, body with image data as `[image:<id>]`) is read when the detail dialog
 * opens; the raw response only for a download. Both gzip-compressed with the browser's `CompressionStream`.
 *
 * Every request carries the whole conversation before it, so its body is stored by pointers: each string equal
 * to a text on its path (an earlier node's `user.text` / `assistant.content`, or its own `user.text` — none
 * changes once stored) is left empty and listed in `refs`. Kept only if restoring gives back exactly what was
 * sent, otherwise stored in full: what's stored stays what was sent, whatever later code does.
 */
export interface RequestRecord {
  headers?: Record<string, string>
  body: unknown
}

type Field = 'user' | 'assistant'
/** A body string replaced by a node's text: its JSON path, the node (null: the record's own), which text. */
type Ref = [path: (string | number)[], node: string | null, field: Field]
/** A request as stored (inside the compressed data). */
export interface PackedRequest extends RequestRecord {
  refs?: Ref[]
}

/** Shorter strings aren't worth a pointer. */
const MIN_REF = 40

const textOf = (n: ChatNode, f: Field) => (f === 'user' ? n.user.text : n.assistant.content)

/** `req` with every string found on `node`'s path (`path`: root → parent) replaced by a pointer. */
export function packRequest(req: RequestRecord, node: ChatNode, path: ChatNode[]): PackedRequest {
  const full: PackedRequest = { ...(req.headers && { headers: req.headers }), body: req.body }
  const texts = new Map<string, [string | null, Field]>()
  const add = (text: string, id: string | null, f: Field) => {
    if (text.length >= MIN_REF && !texts.has(text)) texts.set(text, [id, f])
  }
  add(node.user.text, null, 'user')
  for (const n of path) {
    // A reply still streaming hasn't got its stored text yet.
    if (n.id === node.id || n.attempt.status === 'streaming') continue
    add(n.user.text, n.id, 'user')
    add(n.assistant.content, n.id, 'assistant')
  }
  const refs: Ref[] = []
  const walk = (v: unknown, at: (string | number)[]): unknown => {
    if (typeof v === 'string') {
      const found = at.length ? texts.get(v) : undefined
      if (!found) return v
      refs.push([at, ...found])
      return ''
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, [...at, i]))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, [...at, k])]))
    return v
  }
  if (!texts.size) return full
  const body = walk(req.body, [])
  if (!refs.length) return full
  const packed: PackedRequest = { ...full, body, refs }
  const byId = new Map(path.map((n) => [n.id, n]))
  const back = unpackRequest(packed, (id, f) => {
    const n = id === null ? node : byId.get(id)
    return n && textOf(n, f)
  })
  return JSON.stringify(back.body) === JSON.stringify(req.body) ? packed : full
}

/** The request as sent, its pointers filled in from `text`. */
export function unpackRequest(p: PackedRequest, text: (id: string | null, f: Field) => string | undefined): RequestRecord {
  const out: RequestRecord = p.headers ? { headers: p.headers, body: p.body } : { body: p.body }
  if (!p.refs?.length) return out
  const body = structuredClone(p.body) as Record<string | number, any>
  for (const [path, id, f] of p.refs) {
    const parent = path.slice(0, -1).reduce((o, k) => o[k], body)
    parent[path[path.length - 1]] = text(id, f) ?? ''
  }
  return { ...out, body }
}

/** `p`'s node ids passed through `fn` (an import's new ids). */
export function remapRefs(p: PackedRequest, fn: (id: string) => string): PackedRequest {
  return p.refs ? { ...p, refs: p.refs.map(([path, id, f]) => [path, id === null ? null : fn(id), f]) } : p
}

export async function gzip(value: unknown): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function gunzip(data: StoredRecord['data']): Promise<unknown> {
  if (typeof data === 'string') return JSON.parse(data)
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text())
}

/** UTF-8 size of a raw response (`Attempt.responseSize`). */
export function responseSize(chunks: RawChunk[]) {
  const enc = new TextEncoder()
  return chunks.reduce((sum, c) => sum + enc.encode(c.text).length, 0)
}

/** Stores the request `node` sent (`path`: its context, root → parent). */
export async function saveRequest(node: ChatNode, req: RequestRecord, path: ChatNode[]) {
  const data = await gzip(packRequest(req, node, path))
  await db.requests.put({ id: node.id, conversationId: node.conversationId, data })
}

export async function saveResponse(node: ChatNode, chunks: RawChunk[]) {
  await db.responses.put({ id: node.id, conversationId: node.conversationId, data: await gzip(chunks) })
}

/** The request `node` sent, as sent (null: none stored). */
export async function readRequest(row: StoredRecord, node: ChatNode): Promise<RequestRecord> {
  const p = (await gunzip(row.data)) as PackedRequest
  const ids = [...new Set((p.refs ?? []).flatMap(([, id]) => (id ? [id] : [])))]
  const found = new Map((await db.nodes.bulkGet(ids)).flatMap((n) => (n ? [[n.id, n] as const] : [])))
  return unpackRequest(p, (id, f) => {
    const n = id === null ? node : found.get(id)
    return n && textOf(n, f)
  })
}

export async function loadResponse(nodeId: string): Promise<RawChunk[] | null> {
  const row = await db.responses.get(nodeId)
  return row ? ((await gunzip(row.data)) as RawChunk[]) : null
}

/** Gives `to` (an edited copy) the records of `from`. Inside the caller's transaction. */
export async function copyRecords(from: string, to: ChatNode) {
  const [req, res] = await Promise.all([db.requests.get(from), db.responses.get(from)])
  if (req) await db.requests.put({ ...req, id: to.id, conversationId: to.conversationId })
  if (res) await db.responses.put({ ...res, id: to.id, conversationId: to.conversationId })
}

export async function deleteRecords(nodeIds: string[]) {
  await Promise.all([db.requests.bulkDelete(nodeIds), db.responses.bulkDelete(nodeIds)])
}

/**
 * Compresses records DB v7 moved out as plain JSON (an upgrade can't await the browser's compression: the
 * transaction would end). Run at startup; a few at a time, so an interrupted run just continues next time.
 */
export async function compressPending() {
  for (const table of [db.requests, db.responses])
    for (;;) {
      const rows = await table.where('pending').equals(1).limit(20).toArray()
      if (!rows.length) break
      const done = await Promise.all(
        rows.map(async (r) => ({ id: r.id, conversationId: r.conversationId, data: await gzip(await gunzip(r.data)) })),
      )
      await table.bulkPut(done)
    }
}

/**
 * Splits a node in the pre-v7 shape (request and raw response inline) into the node and its records as plain
 * values (`path`: root → parent). Used by DB v7 and by imports of older files.
 */
export function splitNode(node: ChatNode, path: ChatNode[]): { node: ChatNode; request?: PackedRequest; chunks?: RawChunk[] } {
  const { requestHeaders, requestBody, rawChunks, ...attempt } = node.attempt as ChatNode['attempt'] & {
    requestHeaders?: Record<string, string>
    requestBody?: unknown
    rawChunks?: RawChunk[]
  }
  const chunks = rawChunks?.length ? rawChunks : undefined
  const slim: ChatNode = { ...node, attempt: chunks ? { ...attempt, responseSize: responseSize(chunks) } : attempt }
  const request =
    requestBody != null || requestHeaders
      ? packRequest({ ...(requestHeaders && { headers: requestHeaders }), body: requestBody ?? null }, slim, path)
      : undefined
  return { node: slim, ...(request && { request }), ...(chunks && { chunks }) }
}

/** The raw response of `node` as a .zip: the body as received, its events with arrival times, the merged reply. */
export async function responseZip(node: ChatNode): Promise<{ name: string; blob: Blob } | null> {
  const chunks = await loadResponse(node.id)
  if (!chunks) return null
  const { zipSync, strToU8 } = await import('fflate')
  const raw = chunks.map((c) => c.text).join('')
  const events = streamEvents(chunks)
  const json = (v: unknown) => strToU8(JSON.stringify(v, null, 2))
  const files: Record<string, Uint8Array> = {
    'response.txt': strToU8(raw),
    'events.json': json(events.map((e) => ({ t: e.t, ...(e.event && { event: e.event }), data: e.json ?? e.data }))),
    'merged.json': json(merged(node.attempt.protocol, events.flatMap((e) => (e.json === undefined ? [] : [e.json])))),
  }
  const zip = zipSync(files)
  const d = new Date(node.attempt.startedAt)
  const two = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
  const model = node.attempt.model.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  return { name: `${model}-${stamp}.zip`, blob: new Blob([zip as BlobPart], { type: 'application/zip' }) }
}

function merged(protocol: Protocol, payloads: unknown[]): unknown {
  try {
    return aggregateStream(protocol, payloads)
  } catch (e) {
    return { error: String(e) }
  }
}

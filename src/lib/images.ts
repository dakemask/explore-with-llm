import { useLiveQuery } from 'dexie-react-hooks'
import { nanoid } from 'nanoid'
import { db, type StoredImage } from '../db'
import type { ImagePayload } from '../providers'

/** An image attached in an input box: not tied to a conversation until it's sent. */
export type ImageFile = Omit<StoredImage, 'conversationId' | 'createdAt'>

/** Formats every supported protocol accepts. Anything else is converted. */
const SENDABLE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
/** Per-image limits of the strictest API (Anthropic: 5 MB, 8000 px per side). */
const MAX_BYTES = 5 * 1024 * 1024
const MAX_SIDE = 8000

/**
 * Makes a picked / pasted / dropped file sendable. Sendable files within the limits are kept byte for byte;
 * others are re-encoded (other formats → PNG, too large → downscaled JPEG). Null if it isn't a readable image.
 */
export async function prepareImage(file: Blob): Promise<ImageFile | null> {
  if (!file.type.startsWith('image/')) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    const { width, height } = bitmap
    if (SENDABLE.includes(file.type) && file.size <= MAX_BYTES && Math.max(width, height) <= MAX_SIDE) {
      return { id: nanoid(), blob: file, mime: file.type, width, height }
    }
    let scale = Math.min(1, MAX_SIDE / Math.max(width, height))
    let mime = file.size <= MAX_BYTES ? 'image/png' : 'image/jpeg'
    for (;;) {
      const w = Math.max(1, Math.round(width * scale))
      const h = Math.max(1, Math.round(height * scale))
      const blob = await encode(bitmap, w, h, mime)
      if (blob && blob.size <= MAX_BYTES) return { id: nanoid(), blob, mime, width: w, height: h }
      if (mime === 'image/png') mime = 'image/jpeg'
      else scale *= 0.75
      if (scale < 0.05) return null
    }
  } finally {
    bitmap.close()
  }
}

function encode(bitmap: ImageBitmap, w: number, h: number, mime: string): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // JPEG has no transparency; without a background transparent pixels turn black.
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve) => canvas.toBlob(resolve, mime, 0.9))
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Stores the images of a message being sent (those not stored yet). */
export async function saveImages(conversationId: string, images: ImageFile[]) {
  if (!images.length) return
  const existing = await db.images.bulkGet(images.map((i) => i.id))
  const now = Date.now()
  const fresh = images.filter((_, i) => !existing[i]).map((i) => ({ ...i, conversationId, createdAt: now }))
  if (fresh.length) await db.images.bulkAdd(fresh)
}

/** Base64 payloads for the given image ids (missing ones are skipped). */
export async function loadPayloads(ids: string[]): Promise<Map<string, ImagePayload>> {
  const unique = [...new Set(ids)]
  const records = await db.images.bulkGet(unique)
  const map = new Map<string, ImagePayload>()
  await Promise.all(
    records.map(async (r) => {
      if (r) map.set(r.id, { id: r.id, mime: r.mime, data: await toBase64(r.blob) })
    }),
  )
  return map
}

export const imageMarker = (id: string) => `[image:${id}]`

/**
 * The request body as recorded: every image's base64 data replaced by `[image:<id>]` (the bytes are in
 * the images table, so each request doesn't store its own copy of every image in its context).
 */
export function maskImages(body: unknown, payloads: Iterable<ImagePayload>): unknown {
  const list = [...payloads]
  if (!list.length) return body
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      let s = v
      for (const p of list) if (s.includes(p.data)) s = s.split(p.data).join(imageMarker(p.id))
      return s
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(body)
}

/** Deletes a conversation's images that no node refers to any more. */
export async function pruneImages(conversationId: string) {
  const nodes = await db.nodes.where('conversationId').equals(conversationId).toArray()
  const used = new Set(nodes.flatMap((n) => n.user.images ?? []))
  const ids = (await db.images.where('conversationId').equals(conversationId).primaryKeys()).filter((id) => !used.has(id))
  if (ids.length) await db.images.bulkDelete(ids)
}

// Images never change, so one object URL per image id lives as long as the page (reloading the record
// from IndexedDB gives a new Blob object; keying by id avoids a new URL and a flicker each time).
const urls = new Map<string, string>()

export function imageUrl(image: { id: string; blob: Blob }) {
  let url = urls.get(image.id)
  if (!url) urls.set(image.id, (url = URL.createObjectURL(image.blob)))
  return url
}

/** Stored images by id, in order (undefined while loading; missing ones left out). */
export function useStoredImages(ids: string[] | undefined): StoredImage[] | undefined {
  const key = ids?.join(',') ?? ''
  return useLiveQuery(
    async () => (ids?.length ? (await db.images.bulkGet(ids)).filter((r): r is StoredImage => !!r) : []),
    [key],
  )
}

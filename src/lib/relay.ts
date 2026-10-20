import { httpError } from '../providers/types'

export const RELAY_SERVICE = 'explore-with-llm-relay'
export class RelayError extends Error {
  constructor(readonly key: 'urlInvalid' | 'passwordMissing' | 'incompatible' | 'network') {
    super(key)
  }
}

export function relayBase(value: string): string {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
    return url.href.replace(/\/+$/, '')
  } catch {
    throw new RelayError('urlInvalid')
  }
}

/** Encodes UTF-8 passwords for an HTTP header. */
export function relayToken(password: string): string {
  if (!password.trim()) throw new RelayError('passwordMissing')
  return btoa(Array.from(new TextEncoder().encode(password), (b) => String.fromCharCode(b)).join(''))
}

interface RelayConfig {
  url: string
  password: string
}

function fetchRelay(config: RelayConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const endpoint = new URL(relayBase(config.url))
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + path
  endpoint.hash = ''
  const headers = new Headers(init.headers)
  headers.set('X-EWL-Token', relayToken(config.password))
  return fetch(endpoint.href, { ...init, headers, credentials: 'omit', cache: 'no-store', redirect: 'error' }).catch((error) => {
    if (init.signal?.aborted) throw error
    throw new RelayError('network')
  })
}

export function relayFetch(config: RelayConfig, target: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('X-EWL-Target', new URL(target).href)
  return fetchRelay(config, '/relay', { ...init, headers })
}

export async function testRelay(url: string, password: string, signal?: AbortSignal): Promise<void> {
  const response = await fetchRelay({ url, password }, '/health', { signal })
  if (!response.ok) throw await httpError(response)
  const data = await response.json().catch(() => null)
  if (data?.service !== RELAY_SERVICE || data.version !== 1) throw new RelayError('incompatible')
}

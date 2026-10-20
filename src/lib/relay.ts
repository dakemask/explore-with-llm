import type { Provider } from '../db/types'
import { translate } from '../i18n'
import { useSettings } from '../store/settings'

export const RELAY_SERVICE = 'explore-with-llm-relay'
export class RelayError extends Error {}

function message(key: 'relay.urlInvalid' | 'relay.passwordMissing' | 'relay.incompatible' | 'relay.unauthorized' | 'relay.network') {
  return translate(useSettings.getState().lang, key)
}

/** HTTPS in public; HTTP is only allowed for a local relay (browser permissions still apply). */
export function relayBase(value: string): string {
  try {
    const url = new URL(value.trim())
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash)
      throw new Error()
    return url.href.replace(/\/+$/, '')
  } catch {
    throw new RelayError(message('relay.urlInvalid'))
  }
}

/** UTF-8 passwords work in an HTTP header too. This encoding is not encryption; public relays require HTTPS. */
export function relayToken(password: string): string {
  if (!password.trim()) throw new RelayError(message('relay.passwordMissing'))
  return btoa(Array.from(new TextEncoder().encode(password), (b) => String.fromCharCode(b)).join(''))
}

/** Routing happens only at the network boundary: provider request records never contain the relay password. */
export function providerFetch(provider: Provider | undefined, url: string, init: RequestInit = {}): Promise<Response> {
  if (!provider?.useRelay) return fetch(url, init)
  const { relayUrl, relayPassword } = useSettings.getState()
  const base = relayBase(relayUrl)
  const headers = new Headers(init.headers)
  headers.set('X-EWL-Target', new URL(url).href)
  headers.set('X-EWL-Token', relayToken(relayPassword))
  return fetch(`${base}/relay`, { ...init, headers, credentials: 'omit', cache: 'no-store', redirect: 'error' }).catch((error) => {
    if (init.signal?.aborted) throw error
    throw new RelayError(message('relay.network'))
  })
}

export async function testRelay(url: string, password: string, signal?: AbortSignal): Promise<void> {
  const base = relayBase(url)
  const token = relayToken(password)
  let response: Response
  try {
    response = await fetch(`${base}/health`, {
      headers: { 'X-EWL-Token': token }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new RelayError(message('relay.network'))
  }
  if (response.status === 401) throw new RelayError(message('relay.unauthorized'))
  if (!response.ok) throw new RelayError(`HTTP ${response.status}`)
  const data = await response.json().catch(() => null)
  if (data?.service !== RELAY_SERVICE || data.version !== 1) throw new RelayError(message('relay.incompatible'))
}

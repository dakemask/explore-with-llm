import type { Provider } from '../db/types'
import runtime from '../relay/runtime.js?raw'
import node from '../relay/node.mjs?raw'

/** Only user-configured provider origins are reachable. New origins require a new download/deployment. */
export function relayTargets(providers: Pick<Provider, 'baseUrl'>[]): string[] {
  return [...new Set(providers.flatMap((provider) => {
    try {
      const url = new URL(provider.baseUrl.trim())
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? [url.origin] : []
    } catch { return [] }
  }))].sort()
}

/** JSON encoding keeps passwords containing quotes, newlines, Unicode, etc. inside a literal string. */
export function relayScript(kind: 'cloudflare' | 'node', password: string, origin: string, targets: string[]): string {
  if (!password.trim()) throw new Error('A nonempty relay password is required.')
  const config = JSON.stringify({ password, origins: [origin], targets }, null, 2)
  const header = '// Explore with LLM relay v1. PRIVATE: this file contains your relay password.\n' +
    '// Re-download and redeploy after changing the password, app origin, or provider origins.\n'
  return `${header}const CONFIG = ${config};\n\n${runtime}\n\n${kind === 'node' ? node : 'export default { fetch: createRelay(CONFIG) };\n'}`
}

export async function relayFile(kind: 'cloudflare' | 'node', password: string, origin: string, targets: string[]): Promise<{ name: string; blob: Blob }> {
  const source = relayScript(kind, password, origin, targets)
  if (kind === 'node') return { name: 'relay.mjs', blob: new Blob([source], { type: 'text/javascript;charset=utf-8' }) }
  const { strToU8, zipSync } = await import('fflate')
  // _worker.js must be at the ZIP root so Pages recognizes it as server code, not a public asset.
  const zip = zipSync({ '_worker.js': strToU8(source) })
  return { name: 'cloudflare-relay.zip', blob: new Blob([zip as BlobPart], { type: 'application/zip' }) }
}

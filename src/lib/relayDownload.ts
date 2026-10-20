import runtime from '../relay/runtime.js?raw'
import node from '../relay/node.mjs?raw'

/** JSON encoding keeps passwords containing quotes, newlines, Unicode, etc. inside a literal string. */
export function relayScript(kind: 'cloudflare' | 'node', password: string): string {
  if (!password.trim()) throw new Error('A nonempty relay password is required.')
  const config = JSON.stringify({ password }, null, 2)
  const header = '// Explore with LLM relay v1\n'
  return `${header}const CONFIG = ${config};\n\n${runtime}\n\n${kind === 'node' ? node : 'export default { fetch: createRelay(CONFIG) };\n'}`
}

export async function relayFile(kind: 'cloudflare' | 'node', password: string): Promise<{ name: string; blob: Blob }> {
  const source = relayScript(kind, password)
  if (kind === 'node') return { name: 'relay.mjs', blob: new Blob([source], { type: 'text/javascript;charset=utf-8' }) }
  const { strToU8, zipSync } = await import('fflate')
  // _worker.js must be at the ZIP root so Pages recognizes it as server code, not a public asset.
  const zip = zipSync({ '_worker.js': strToU8(source) })
  return { name: 'cloudflare-relay.zip', blob: new Blob([zip as BlobPart], { type: 'application/zip' }) }
}

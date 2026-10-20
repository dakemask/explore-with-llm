// Requires Node.js 22 or newer. Start: node relay.mjs
// Local by default. On a server: set HOST=0.0.0.0, put HTTPS in front, and keep this process running.
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// Native HTTP preserves streamed uploads and 401/407 responses without fetch trying to replay the body.
// It also leaves compressed response bytes intact, matching their Content-Encoding header.
const handle = createRelay(CONFIG, (url, init) => new Promise((resolve, reject) => {
  const transport = new URL(url).protocol === 'https:' ? httpsRequest : httpRequest
  const upstream = transport(url, {
    method: init.method, headers: Object.fromEntries(init.headers), signal: init.signal,
  }, (response) => {
    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(response.headers)) {
        for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, part)
      }
      const body = [204, 205, 304].includes(response.statusCode) ? null : Readable.toWeb(response)
      resolve(new Response(body, { status: response.statusCode, statusText: response.statusMessage, headers }))
    } catch (error) { response.destroy(); reject(error) }
  })
  upstream.on('error', reject)
  if (init.body) pipeline(Readable.fromWeb(init.body), upstream).catch(reject)
  else upstream.end()
}))
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 8787)
if (!CONFIG.password.trim()) throw new Error('A nonempty relay password is required.')
const server = createServer(async (incoming, outgoing) => {
  const abort = new AbortController()
  outgoing.on('close', () => { if (!outgoing.writableFinished) abort.abort() })
  incoming.on('aborted', () => abort.abort())
  try {
    const request = new Request(new URL(incoming.url, 'http://relay.local'), {
      method: incoming.method, headers: incoming.headers,
      body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : Readable.toWeb(incoming),
      duplex: 'half', signal: abort.signal,
    })
    const response = await handle(request)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing)
    else outgoing.end()
  } catch {
    if (outgoing.headersSent || abort.signal.aborted) outgoing.destroy()
    else {
      outgoing.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      outgoing.end(JSON.stringify({ error: { message: 'Relay: request failed.' } }))
    }
  }
})
// Thinking models can wait minutes; there is no application-level response timeout.
server.requestTimeout = 0
server.headersTimeout = 60000
server.on('error', (error) => { console.error(`Relay: ${error.message}`); process.exitCode = 1 })
server.listen(port, host, () => {
  console.log(`Relay listening at http://${host.includes(':') ? `[${host}]` : host}:${server.address().port}`)
  console.log('Use the same password in the app. Keep this terminal open. Ctrl+C stops the relay.')
})

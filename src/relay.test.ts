import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import type { Protocol, Provider } from './db/types'
import { providerFetch, relayBase, RelayError, relayToken, testRelay } from './lib/relay'
import { relayFile, relayScript, relayTargets } from './lib/relayDownload'
import { listModels, prepareChat, sendChat } from './providers'
import runtime from './relay/runtime.js?raw'
import { useSettings } from './store/settings'

const origin = 'https://app.example'
const target = 'https://api.example'
const password = 'a long 密码 " \\ $&\nwith unicode 🐈'
type Handler = (request: Request) => Promise<Response>
type Config = { password: string; origins: string[]; targets: string[] }
const makeRelay = new Function('config', 'upstream', `${runtime}\nreturn createRelay(config, upstream)`) as (config: Config, upstream: (url: string, init: RequestInit) => Promise<Response>) => Handler
const config = { password, origins: [origin], targets: [target] }
const provider = (protocol: Protocol = 'openai-chat', useRelay = true): Provider => ({
  id: 'p', name: 'P', protocol, baseUrl: `${target}/v1`, apiKey: 'sk-provider-key', models: ['m'], createdAt: 0, useRelay,
})
const request = (path = '/relay', options: RequestInit = {}) => new Request(`https://relay.example${path}`, {
  ...options, headers: {
    Origin: origin, 'X-EWL-Token': relayToken(password), 'X-EWL-Target': `${target}/v1/chat/completions`,
    ...options.headers,
  },
})

beforeEach(() => useSettings.setState({ lang: 'en', relayUrl: 'https://relay.example/prefix/', relayPassword: password }))
afterEach(() => vi.unstubAllGlobals())

describe('relay contract and security', () => {
  it('authenticates health, rejects wrong passwords and origins, and handles preflight without forwarding', async () => {
    const upstream = vi.fn()
    const handle = makeRelay(config, upstream)
    const health = await handle(request('/health'))
    expect(await health.json()).toEqual({ service: 'explore-with-llm-relay', version: 1 })
    expect(health.headers.get('access-control-allow-origin')).toBe(origin)
    expect((await handle(request('/health', { headers: { 'X-EWL-Token': 'wrong' } }))).status).toBe(401)
    expect((await handle(request('/health', { headers: { Origin: 'https://evil.example' } }))).headers.has('access-control-allow-origin')).toBe(false)
    expect((await handle(request('/relay', { method: 'DELETE' }))).status).toBe(405)
    const preflight = await handle(request('/relay', { method: 'OPTIONS', headers: {
      'X-EWL-Token': '', 'Access-Control-Request-Headers': 'authorization,x-api-key,x-ewl-token,x-ewl-target,content-type',
    } }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization')
    expect(upstream).not.toHaveBeenCalled()
    expect((await makeRelay({ ...config, password: '' }, upstream)(request('/health'))).status).toBe(503)
  })

  it('rejects unapproved origins, credentials in URLs and redirects without forwarding provider secrets elsewhere', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/admin' } }))
    const handle = makeRelay(config, upstream)
    for (const url of ['https://api.example.evil.test/v1', 'http://127.0.0.1/admin', 'https://user:pass@api.example/v1', 'file:///etc/passwd']) {
      expect((await handle(request('/relay', { headers: { 'X-EWL-Target': url } }))).status).toBe(403)
    }
    expect(upstream).not.toHaveBeenCalled()
    expect((await handle(request())).status).toBe(502)
    expect(upstream).toHaveBeenCalledOnce()
    expect(upstream.mock.calls[0][1].redirect).toBe('manual')
  })

  it('passes bodies, API/custom headers and errors through, stripping relay credentials and cookie/hop headers', async () => {
    const upstream = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      expect(headers.get('authorization')).toBe('Bearer sk-provider-key')
      expect(headers.get('x-api-key')).toBe('anthropic-key')
      expect(headers.get('x-custom')).toBe('custom')
      for (const name of ['x-ewl-token', 'x-ewl-target', 'origin', 'cookie', 'connection', 'x-hop']) expect(headers.has(name)).toBe(false)
      expect(await new Response(init.body).text()).toBe('{"image":"data:image/png;base64,ABC"}')
      return new Response('{"error":{"message":"upstream denied"}}', { status: 401, headers: {
        'Content-Type': 'application/json', 'X-Request-ID': 'upstream-id', 'Set-Cookie': 'secret',
        'Access-Control-Allow-Origin': 'https://wrong.example',
      } })
    })
    const req = request('/relay', { method: 'POST', body: '{"image":"data:image/png;base64,ABC"}', headers: {
      Authorization: 'Bearer sk-provider-key', 'X-API-Key': 'anthropic-key', 'X-Custom': 'custom',
      Cookie: 'browser-cookie', Connection: 'x-hop', 'X-Hop': 'private',
    } })
    const response = await makeRelay(config, upstream)(req)
    expect(response.status).toBe(401)
    expect(await response.text()).toContain('upstream denied')
    expect(response.headers.get('x-request-id')).toBe('upstream-id')
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(upstream.mock.calls[0][1].signal).toBe(req.signal)
  })

  it('returns the first stream bytes before the upstream finishes, and bounds authenticated request frequency', async () => {
    let finish!: () => void
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('first'))
      finish = () => { controller.enqueue(new TextEncoder().encode('last')); controller.close() }
    } })
    const handle = makeRelay(config, vi.fn().mockResolvedValueOnce(new Response(stream)))
    const response = await handle(request())
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('first')
    finish()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('last')
    expect((await reader.read()).done).toBe(true)
    const upstream = vi.fn().mockImplementation(() => new Response('ok'))
    const limited = makeRelay(config, upstream)
    for (let i = 0; i < 120; i++) await limited(request())
    expect((await limited(request())).status).toBe(429)
    expect(upstream).toHaveBeenCalledTimes(120)
  })
})

describe('app routing and downloads', () => {
  it('leaves existing providers direct, validates relay configuration before sending, and retains abort signals', async () => {
    const network = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', network)
    useSettings.setState({ relayUrl: '', relayPassword: '' })
    await providerFetch(provider('openai-chat', false), `${target}/models`)
    expect(network.mock.calls[0][0]).toBe(`${target}/models`)
    expect(() => providerFetch(provider(), `${target}/models`)).toThrow(RelayError)
    expect(network).toHaveBeenCalledOnce()
    for (const url of ['http://public.example', 'https://user:pass@relay.example', 'https://relay.example?q=secret', 'file:///relay']) expect(() => relayBase(url)).toThrow()
    expect(relayBase(' http://127.0.0.1:8787/ ')).toBe('http://127.0.0.1:8787')
    expect(relayBase('http://[::1]:8787')).toBe('http://[::1]:8787')
    useSettings.setState({ relayUrl: 'https://relay.example', relayPassword: password })
    const controller = new AbortController()
    await providerFetch(provider(), `${target}/models`, { signal: controller.signal })
    const init = network.mock.calls[1][1]
    expect(init.signal).toBe(controller.signal)
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('error')
  })

  it.each<Protocol>(['openai-chat', 'openai-responses', 'anthropic'])('routes model listing for %s through the same relay', async (protocol) => {
    const upstream = vi.fn().mockResolvedValue(new Response('{"data":[{"id":"b"},{"id":"a"}]}'))
    const handle = makeRelay(config, upstream)
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      expect(url).toBe('https://relay.example/prefix/relay')
      const headers = new Headers(init.headers)
      headers.set('Origin', origin)
      return handle(new Request(url, { ...init, headers }))
    })
    expect(await listModels(provider(protocol))).toEqual(['a', 'b'])
    expect(upstream.mock.calls[0][0]).toContain('/models')
  })

  it('routes streamed chat without writing transport credentials into the prepared provider request', async () => {
    const handle = makeRelay(config, vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n')))
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => handle(new Request(url, init)))
    const p = provider()
    const req = prepareChat(p, 'm', [{ role: 'user', content: 'hi' }])
    const saved = JSON.stringify(req)
    const events = await sendChat(p, req, new AbortController().signal)
    const items = []
    for await (const event of events) items.push(event)
    expect(items).toContainEqual({ type: 'text', delta: 'hello' })
    expect(JSON.stringify(req)).toBe(saved)
    expect(saved).not.toContain('X-EWL')
  })

  it('tests relay identity and password without invoking a provider', async () => {
    const upstream = vi.fn()
    const handle = makeRelay(config, upstream)
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => handle(new Request(url, init)))
    await expect(testRelay('https://relay.example', password)).resolves.toBeUndefined()
    await expect(testRelay('https://relay.example', 'wrong')).rejects.toThrow('Incorrect relay password')
    expect(upstream).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>wrong site</html>')))
    await expect(testRelay('https://wrong.example', password)).rejects.toThrow('not a compatible relay')
  })

  it('downloads a Pages ZIP with a root worker, executable safe password literals and no provider API keys', async () => {
    const targets = relayTargets([provider(), { baseUrl: 'https://api.example/another' }, { baseUrl: 'not a url' }])
    expect(targets).toEqual([target])
    const file = await relayFile('cloudflare', password, origin, targets)
    const files = unzipSync(new Uint8Array(await file.blob.arrayBuffer()))
    expect(file.name).toBe('cloudflare-relay.zip')
    expect(Object.keys(files)).toEqual(['_worker.js'])
    const source = strFromU8(files['_worker.js'])
    expect(source).not.toContain('sk-provider-key')
    const worker = new Function(source.replace('export default', 'return'))() as { fetch: Handler }
    expect((await worker.fetch(request('/health'))).status).toBe(200)
    expect((await worker.fetch(request('/health', { headers: { 'X-EWL-Token': 'wrong' } }))).status).toBe(401)
    expect(relayScript('cloudflare', password, origin, targets)).toBe(source)
    const node = await relayFile('node', password, origin, targets)
    expect(node.name).toBe('relay.mjs')
    expect(await node.blob.text()).toContain("from 'node:http'")
  })
})

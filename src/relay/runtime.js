// Shared by the Pages download and the standalone Node.js download. No dependencies.
function createRelay(config, fetchUpstream = fetch) {
  const token = btoa(Array.from(new TextEncoder().encode(config.password), (b) => String.fromCharCode(b)).join(''))
  const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length'])

  function cleanHeaders(source, response = false) {
    const headers = new Headers(source)
    const connection = headers.get('connection')
    for (const name of connection?.split(',') ?? []) headers.delete(name.trim())
    for (const name of [...headers.keys()]) {
      const lower = name.toLowerCase()
      if (hopHeaders.has(lower) || lower.startsWith('x-ewl-') || lower.startsWith('access-control-') ||
          (response ? lower === 'set-cookie' : ['origin', 'referer', 'cookie'].includes(lower))) headers.delete(name)
    }
    return headers
  }

  return async function handle(request) {
    const cors = new Headers({ 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' })
    const json = (status, data) => new Response(JSON.stringify(data), {
      status, headers: new Headers([...cors, ['Content-Type', 'application/json; charset=utf-8']]),
    })
    const error = (status, message) => json(status, { error: { message } })
    const path = new URL(request.url).pathname
    if (!path.endsWith('/health') && !path.endsWith('/relay')) return error(404, 'Relay endpoint not found.')

    // Browser preflights carry no password and must never contact the upstream.
    if (request.method === 'OPTIONS') {
      cors.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      cors.set('Access-Control-Allow-Headers', request.headers.get('access-control-request-headers') ?? '*')
      cors.set('Access-Control-Max-Age', '600')
      return new Response(null, { status: 204, headers: cors })
    }
    if (!config.password.trim()) return error(503, 'Relay password is missing.')
    const supplied = request.headers.get('x-ewl-token') ?? ''
    if (supplied !== token) return error(401, 'Incorrect relay password.')
    if (path.endsWith('/health')) {
      if (request.method !== 'GET') return error(405, 'Method not supported.')
      return json(200, { service: 'explore-with-llm-relay', version: 1 })
    }
    if (!['GET', 'POST'].includes(request.method)) return error(405, 'Method not supported.')
    let target
    try {
      target = new URL(request.headers.get('x-ewl-target') ?? '')
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error()
    } catch {
      return error(400, 'Invalid provider URL.')
    }
    const headers = cleanHeaders(request.headers)
    headers.set('Accept-Encoding', 'identity')
    try {
      const upstream = await fetchUpstream(target.href, {
        method: request.method, headers,
        body: request.method === 'POST' ? request.body : undefined,
        signal: request.signal, redirect: 'manual', credentials: 'omit',
      })
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel()
        return error(502, 'Provider redirected the request. Check the API URL.')
      }
      const resultHeaders = cleanHeaders(upstream.headers, true)
      for (const [name, value] of cors) resultHeaders.set(name, value)
      // Pass through the stream, HTTP status, and upstream error body without parsing the model payload.
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: resultHeaders })
    } catch {
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return error(502, 'Could not connect to the provider.')
    }
  }
}

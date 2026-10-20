// Shared by the Pages download and the standalone Node.js download. No dependencies.
function createRelay(config, fetchUpstream = fetch) {
  const allowedOrigins = new Set(config.origins)
  const allowedTargets = new Set(config.targets)
  const token = btoa(Array.from(new TextEncoder().encode(config.password), (b) => String.fromCharCode(b)).join(''))
  const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length'])
  let windowStart = 0
  let requests = 0

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
    const origin = request.headers.get('origin')
    const cors = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin' })
    if (origin && allowedOrigins.has(origin)) {
      cors.set('Access-Control-Allow-Origin', origin)
      cors.set('Access-Control-Expose-Headers', '*')
    }
    const json = (status, data) => new Response(JSON.stringify(data), {
      status, headers: new Headers([...cors, ['Content-Type', 'application/json; charset=utf-8']]),
    })
    const error = (status, message) => json(status, { error: { message } })
    if (origin && !allowedOrigins.has(origin)) return error(403, 'Relay: this website origin is not allowed. Download and deploy a script from this app address.')
    const path = new URL(request.url).pathname
    if (!path.endsWith('/health') && !path.endsWith('/relay')) return error(404, 'Relay: use the app connection test, or the /health and /relay endpoints.')

    // Browser preflights carry no password and must never contact the upstream.
    if (request.method === 'OPTIONS') {
      cors.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      const names = request.headers.get('access-control-request-headers') ?? ''
      if (names.length > 8192 || !/^[a-zA-Z0-9!#$%&'*+.^_`|~,\s-]*$/.test(names)) return error(400, 'Relay: invalid preflight headers.')
      cors.set('Access-Control-Allow-Headers', names)
      cors.set('Access-Control-Max-Age', '600')
      return new Response(null, { status: 204, headers: cors })
    }
    if (!config.password.trim()) return error(503, 'Relay: a nonempty password is required. Download a new script.')
    const supplied = request.headers.get('x-ewl-token') ?? ''
    let mismatch = supplied.length ^ token.length
    for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ (supplied.charCodeAt(i) || 0)
    if (mismatch !== 0) return error(401, 'Relay: incorrect password / 转发密码不正确。')
    if (path.endsWith('/health')) {
      if (request.method !== 'GET') return error(405, 'Relay: health checks require GET.')
      return json(200, { service: 'explore-with-llm-relay', version: 1 })
    }
    if (!['GET', 'POST'].includes(request.method)) return error(405, 'Relay: only GET and POST are supported.')
    let target
    try {
      target = new URL(request.headers.get('x-ewl-target') ?? '')
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash || !allowedTargets.has(target.origin)) throw new Error()
    } catch {
      return error(403, 'Relay: provider address is not allowed. Download and deploy a new script after changing provider addresses. / 供应商地址不在允许列表中，请重新下载并部署脚本。')
    }
    // A small per-instance limit, not a distributed DDoS protection service.
    const now = Date.now()
    if (now - windowStart >= 60000) { windowStart = now; requests = 0 }
    if (++requests > 120) return error(429, 'Relay: too many requests. Try again in a minute.')
    const headers = cleanHeaders(request.headers)
    headers.set('Accept-Encoding', 'identity')
    try {
      const upstream = await fetchUpstream(target.href, {
        method: request.method, headers,
        body: request.method === 'POST' ? request.body : undefined,
        signal: request.signal, redirect: 'manual', credentials: 'omit',
      })
      // Never follow redirects with provider credentials, including redirects into a private network.
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel()
        return error(502, 'Relay: upstream redirected the request. Set the provider API address to its final URL.')
      }
      const resultHeaders = cleanHeaders(upstream.headers, true)
      for (const [name, value] of cors) resultHeaders.set(name, value)
      resultHeaders.set('Vary', [upstream.headers.get('vary'), 'Origin'].filter(Boolean).join(', '))
      // Pass through the stream, HTTP status, and upstream error body without parsing the model payload.
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: resultHeaders })
    } catch {
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return error(502, 'Relay: could not reach the provider. Check its API address and network availability. / 转发服务无法连接供应商，请检查接口地址与网络。')
    }
  }
}

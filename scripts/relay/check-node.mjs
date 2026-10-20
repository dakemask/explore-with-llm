// Regression checks for the downloadable, dependency-free Node adapter. No real credentials or API calls.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'

test('standalone Node relay preserves HTTP errors, compressed data, streaming and cancellation', { timeout: 15000 }, async (t) => {
  let disconnected
  const closed = new Promise(resolve => { disconnected = resolve })
  const upstream = createServer(async (req, res) => {
    const parts = []
    for await (const chunk of req) parts.push(chunk)
    if (req.url === '/auth') {
      assert.equal(req.headers.authorization, 'Bearer fake-provider-key')
      assert.equal(req.headers['x-ewl-token'], undefined)
      assert.equal(Buffer.concat(parts).toString(), '{"hello":"world"}')
      res.writeHead(401, { 'Content-Type': 'application/json', 'X-Request-ID': 'auth-error' })
      return res.end('{"error":{"message":"bad API key"}}')
    }
    if (req.url === '/gzip') {
      res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Type': 'text/plain' })
      return res.end(gzipSync('compressed response'))
    }
    if (req.url === '/slow') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: first\n\n')
      res.on('close', disconnected)
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"data":[{"id":"test-model"}]}')
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  t.after(() => { upstream.closeAllConnections(); upstream.close() })
  const target = `http://127.0.0.1:${upstream.address().port}`
  const password = 'integration-password-测试'
  const config = { password, origins: ['https://app.example'], targets: [target] }
  const runtime = await readFile(new URL('../../src/relay/runtime.js', import.meta.url), 'utf8')
  const adapter = await readFile(new URL('../../src/relay/node.mjs', import.meta.url), 'utf8')
  const child = spawn(process.execPath, ['--input-type=module', '-'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  t.after(() => child.kill())
  let stderr = ''
  child.stderr.on('data', data => { stderr += data })
  const ready = new Promise((resolve, reject) => {
    let output = ''
    child.stdout.on('data', data => {
      output += data
      const match = output.match(/Relay listening at (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) resolve(match[1])
    })
    child.on('error', reject)
    child.on('exit', code => reject(new Error(`Relay exited (${code}): ${stderr}`)))
  })
  child.stdin.end(`const CONFIG = ${JSON.stringify(config)};\n${runtime}\n${adapter}`)
  const base = await ready
  const headers = path => ({
    Origin: 'https://app.example', 'X-EWL-Token': Buffer.from(password).toString('base64'),
    'X-EWL-Target': `${target}${path}`, Authorization: 'Bearer fake-provider-key', 'Content-Type': 'application/json',
  })
  await t.test('authentication and normal GET', async () => {
    const denied = await fetch(`${base}/health`, { headers: { 'X-EWL-Token': 'wrong' } })
    assert.equal(denied.status, 401)
    const response = await fetch(`${base}/relay`, { headers: headers('/models') })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { data: [{ id: 'test-model' }] })
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example')
  })
  await t.test('POST HTTP 401 keeps its original status, headers and body', async () => {
    const response = await fetch(`${base}/relay`, { method: 'POST', headers: headers('/auth'), body: '{"hello":"world"}' })
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('x-request-id'), 'auth-error')
    assert.equal(await response.text(), '{"error":{"message":"bad API key"}}')
  })
  await t.test('compressed upstream bytes still match Content-Encoding', async () => {
    const response = await fetch(`${base}/relay`, { headers: headers('/gzip') })
    assert.equal(await response.text(), 'compressed response')
  })
  await t.test('streams before completion and aborts the upstream on disconnect', async () => {
    const abort = new AbortController()
    const response = await fetch(`${base}/relay`, { headers: headers('/slow'), signal: abort.signal })
    const reader = response.body.getReader()
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: first\n\n')
    abort.abort()
    await assert.rejects(reader.read())
    await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Upstream not cancelled')), 2000); timer.unref() })])
  })
})

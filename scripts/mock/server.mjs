// Fake OpenAI-compatible streaming server for manual / browser testing without a real API key.
// Usage: node scripts/mock/server.mjs   (env: PORT=8787, DELAY=8 ms between chunks)
// In the app, add a Custom provider with base URL http://localhost:8787 and any key.
// Models: mock-chat (streams reasoning + reply.md), mock-bad (returns HTTP 401).
import fs from 'node:fs'
import http from 'node:http'

const reply = fs.readFileSync(new URL('./reply.md', import.meta.url), 'utf8')
const reasoning = '用户在问二分查找，先讲复杂度再给代码。'
const port = Number(process.env.PORT ?? 8787)
const delay = Number(process.env.DELAY ?? 8)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}
let count = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

http
  .createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      return res.end()
    }
    if (req.url.endsWith('/models')) {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ data: [{ id: 'mock-chat' }, { id: 'mock-bad' }] }))
    }

    let body = ''
    for await (const c of req) body += c
    const { model, messages } = JSON.parse(body)
    count++
    if (model === 'mock-bad') {
      res.writeHead(401, { ...cors, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: 'Authentication Fails (no such user)' } }))
    }

    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream' })
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    for (const ch of reasoning) {
      send({ choices: [{ delta: { reasoning_content: ch } }] })
      await sleep(15)
    }
    // Echo the request so branches are distinguishable in tests.
    const last = messages.at(-1)?.content ?? ''
    const text = `> 第 ${count} 次请求 · 上下文 ${messages.length} 条 · 「${last.slice(0, 30)}」

` + reply
    for (let i = 0; i < text.length; i += 4) {
      send({ choices: [{ delta: { content: text.slice(i, i + 4) } }] })
      await sleep(delay)
    }
    send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
    send({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 } })
    res.end('data: [DONE]\n\n')
  })
  .listen(port, () => console.log(`mock LLM on http://localhost:${port}`))

// Fake OpenAI-compatible streaming server for manual / browser testing without a real API key.
// Usage: node scripts/mock/server.mjs   (env: PORT=8787, DELAY=8 ms between chunks)
// In the app, add a Custom provider with base URL http://localhost:8787 and any key.
// Models:
//   mock-chat   DeepSeek style: reasoning_content + reply.md
//   mock-think  OpenRouter style: `reasoning` summary text + reasoning_details (summary + encrypted blob)
//   mock-tags   thinking inline in content as <think>…</think>
//   mock-bad    returns HTTP 401
// Every reply starts with a line echoing the request (counter, context size, extra fields found on
// earlier assistant messages, last user message) so branches and echo-back are visible in tests.
import fs from 'node:fs'
import http from 'node:http'

const reply = fs.readFileSync(new URL('./reply.md', import.meta.url), 'utf8')
const reasoning = '用户在问**二分查找**，计划：\n\n1. 先讲复杂度 $O(\\log n)$\n2. 再给 `Python` 代码'
const port = Number(process.env.PORT ?? 8787)
const delay = Number(process.env.DELAY ?? 8)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}
const MODELS = ['mock-chat', 'mock-think', 'mock-tags', 'mock-bad']
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
      return res.end(JSON.stringify({ data: MODELS.map((id) => ({ id })) }))
    }

    let body = ''
    for await (const c of req) body += c
    const { model, messages } = JSON.parse(body)
    count++
    if (model === 'mock-bad') {
      res.writeHead(401, { ...cors, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: 'Authentication Fails (no such user)' } }))
    }

    res.writeHead(200, {
      ...cors,
      'Content-Type': 'text/event-stream',
      'X-Request-Id': `mock-${count}`,
      // Only exposed headers are readable from the page; the app's detail panel shows this one.
      'Access-Control-Expose-Headers': 'X-Request-Id',
    })
    const head = { id: `chatcmpl-${count}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model }
    // OpenRouter repeats which upstream served the request on every chunk.
    if (model === 'mock-think') head.provider = 'MockAI'
    const send = (o) => res.write(`data: ${JSON.stringify({ ...head, ...o })}\n\n`)
    const delta = (d) => send({ choices: [{ index: 0, delta: d, finish_reason: null }] })

    delta({ role: 'assistant', content: '' })
    if (model === 'mock-think') {
      for (const ch of reasoning) {
        delta({ reasoning: ch, reasoning_details: [{ type: 'reasoning.summary', summary: ch, index: 0, format: 'openai-responses-v1' }] })
        await sleep(15)
      }
      const blob = Buffer.from(`encrypted-reasoning-${count}-`.repeat(60)).toString('base64')
      delta({ reasoning_details: [{ type: 'reasoning.encrypted', data: blob, id: `rs_${count}`, index: 1, format: 'openai-responses-v1' }] })
    } else if (model !== 'mock-tags') {
      for (const ch of reasoning) {
        delta({ reasoning_content: ch })
        await sleep(15)
      }
    }

    const extras = new Set()
    for (const m of messages) {
      if (m.role === 'assistant') for (const k of Object.keys(m)) if (k !== 'role' && k !== 'content') extras.add(k)
    }
    const last = messages.at(-1)?.content ?? ''
    let text =
      `> 第 ${count} 次请求 · 上下文 ${messages.length} 条 · 回传 ${extras.size ? [...extras].join(', ') : '无'} · 「${last.slice(0, 30)}」\n\n` +
      reply
    if (model === 'mock-tags') text = `<think>\n${reasoning}\n</think>\n\n` + text
    for (let i = 0; i < text.length; i += 4) {
      delta({ content: text.slice(i, i + 4) })
      await sleep(delay)
    }
    send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
    send({
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110, completion_tokens_details: { reasoning_tokens: 17 } },
    })
    res.end('data: [DONE]\n\n')
  })
  .listen(port, () => console.log(`mock LLM on http://localhost:${port}`))

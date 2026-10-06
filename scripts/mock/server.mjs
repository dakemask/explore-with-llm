// Fake streaming LLM server for manual / browser testing without a real API key. Speaks three protocols,
// chosen by the request path:
//   …/chat/completions   OpenAI Chat Completions   (base URL http://localhost:8787)
//   …/responses          OpenAI Responses          (base URL http://localhost:8787)
//   …/v1/messages        Anthropic Messages        (base URL http://localhost:8787)
// Usage: node scripts/mock/server.mjs   (env: PORT=8787, DELAY=8 ms between chunks, EXTRA_MODELS=0 filler
// models appended to the model list, plus one duplicate entry, for testing long lists)
// Models (same meaning in every protocol, in that protocol's native shape):
//   mock-chat   plain reasoning text (chat: reasoning_content; anthropic: thinking + signature; responses: summary)
//   mock-think  summary + encrypted reasoning (chat: OpenRouter reasoning_details; anthropic: redacted_thinking
//               + thinking; responses: two summary parts + encrypted_content)
//   mock-tags   thinking inline in content as <think>…</think>
//   mock-bad    returns HTTP 401
//   mock-cut    starts like mock-chat, then drops the connection mid-reply
//   mock-empty  200 with an event stream that ends without any output
//   mock-hang   accepts the request and never answers (for the waiting timer)
//   mock-long   like mock-chat with long reasoning (40 paragraphs, a line every 120 ms) and the reply
//               three times (for folding / sticky reasoning and scroll tests)
//   mock-name   a short quoted title instead of the usual reply (automatic naming): which prompt it got
//               (conversation / side question) and how many context messages the side prompt had
// Every reply starts with a line echoing the request (counter, protocol, context size, echoed reasoning found
// in the context, body fields beyond the protocol's own, last user message) so branches, echo-back and
// parameters are visible in tests. Anthropic requests without max_tokens get the API's 400 error.
// User content may be a list of parts (images + text in the protocol's own shape): the echo line counts the
// images in the whole context, and a part of unknown shape gets a 400 like a real API.
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
  // Only exposed headers are readable from the page; the app's detail panel shows this one.
  'Access-Control-Expose-Headers': 'X-Request-Id',
}
const extra = Number(process.env.EXTRA_MODELS ?? 0)
const MODELS = ['mock-chat', 'mock-think', 'mock-tags', 'mock-bad', 'mock-cut', 'mock-empty', 'mock-hang', 'mock-name', 'mock-long']
if (extra > 0) MODELS.push(...Array.from({ length: extra }, (_, i) => `mock-extra-${String(i + 1).padStart(2, '0')}`), 'mock-chat')
let count = 0
const longReasoning = Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 步：${reasoning.replace(/\n+/g, ' ')}`).join('\n\n')
/** Pause between reasoning pieces: mock-long thinks slowly (a few seconds), for watching it stream. */
const pause = (model) => (model === 'mock-long' ? 120 : 15)
const reasoningOf = (model) => (model === 'mock-long' ? longReasoning : reasoning)
/** The reasoning in streamed pieces: one character at a time, long reasoning a line at a time. */
const pieces = (model, text = reasoningOf(model)) => (model === 'mock-long' ? text.match(/[^]{1,40}/g) : [...text])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const blob = (n) => Buffer.from(`encrypted-reasoning-${n}-`.repeat(60)).toString('base64')

/** Text / image part shapes per protocol; anything else in user content is rejected. */
const DATA_URL = /^data:image\/[\w+.-]+;base64,./
const PARTS = {
  chat: {
    text: (p) => p.type === 'text' && typeof p.text === 'string',
    image: (p) => p.type === 'image_url' && DATA_URL.test(p.image_url?.url ?? ''),
  },
  anthropic: {
    text: (p) => p.type === 'text' && !!p.text,
    image: (p) => p.type === 'image' && p.source?.type === 'base64' && /^image\//.test(p.source.media_type ?? '') && !!p.source.data,
  },
  responses: {
    text: (p) => p.type === 'input_text' && typeof p.text === 'string',
    image: (p) => p.type === 'input_image' && DATA_URL.test(p.image_url ?? ''),
  },
}

/** Text of a user message and its image count; throws on a part of unknown shape. */
function userParts(protocol, content) {
  if (typeof content === 'string') return { text: content, images: 0 }
  let text = ''
  let images = 0
  for (const p of content ?? []) {
    if (PARTS[protocol].text(p)) text += p.text
    else if (PARTS[protocol].image(p)) images++
    else throw new Error(`invalid content part: ${JSON.stringify(p).slice(0, 80)}`)
  }
  return { text, images }
}

/** First line of every reply. `users`: the content of every user message in the context. */
function echoLine({ protocol, context, echoed, params, users }) {
  const p = Object.keys(params).length ? JSON.stringify(params) : '无'
  const parts = users.map((c) => userParts(protocol, c))
  const images = parts.reduce((n, u) => n + u.images, 0)
  const last = parts.at(-1)?.text ?? ''
  return `> 第 ${count} 次请求 · ${protocol} · 上下文 ${context} 条 · 回传 ${echoed.size ? [...echoed].join(', ') : '无'} · 参数 ${p} · 图片 ${images} 张 · 「${String(last).slice(0, 30)}」\n\n`
}

const userContents = (protocol, body) =>
  (protocol === 'responses' ? body.input : body.messages).filter((m) => m.role === 'user').map((m) => m.content)

const replyText = (model, line, users, protocol) => {
  if (model === 'mock-name') return nameText(userParts(protocol, users.at(-1)).text)
  return (model === 'mock-tags' ? `<think>\n${reasoning}\n</think>\n\n` : '') + line + (model === 'mock-long' ? reply.repeat(3) : reply)
}

/** mock-name: "对话标题 #n" for a conversation prompt, "侧问标题 #n（背景 k 条）" for a side-question prompt. */
function nameText(prompt) {
  if (!prompt.includes('follow-up question')) return `“对话标题 #${count}”`
  const context = prompt.match(/for context only:([\s\S]*?)Here's the follow-up/)
  const k = context ? context[1].split('\n\n---------\n\n').length : 0
  return `“侧问标题 #${count}（背景 ${k} 条）”`
}

async function streamText(text, emit) {
  for (let i = 0; i < text.length; i += 4) {
    emit(text.slice(i, i + 4))
    await sleep(delay)
  }
}

async function chat(res, body) {
  const { model, messages, stream, ...params } = body
  const echoed = new Set()
  for (const m of messages) {
    if (m.role === 'assistant') for (const k of Object.keys(m)) if (k !== 'role' && k !== 'content') echoed.add(k)
  }
  const head = { id: `chatcmpl-${count}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model }
  // OpenRouter repeats which upstream served the request on every chunk.
  if (model === 'mock-think') head.provider = 'MockAI'
  const send = (o) => res.write(`data: ${JSON.stringify({ ...head, ...o })}\n\n`)
  const delta = (d) => send({ choices: [{ index: 0, delta: d, finish_reason: null }] })

  delta({ role: 'assistant', content: '' })
  if (model === 'mock-think') {
    for (const ch of reasoning) {
      delta({ reasoning: ch, reasoning_details: [{ type: 'reasoning.summary', summary: ch, index: 0, format: 'openai-responses-v1' }] })
      await sleep(pause(model))
    }
    delta({ reasoning_details: [{ type: 'reasoning.encrypted', data: blob(count), id: `rs_${count}`, index: 1, format: 'openai-responses-v1' }] })
  } else if (model !== 'mock-tags') {
    for (const ch of pieces(model)) {
      delta({ reasoning_content: ch })
      await sleep(pause(model))
    }
  }
  const line = echoLine({ protocol: 'chat', context: messages.length, echoed, params, users: userContents('chat', body) })
  await streamText(replyText(model, line, userContents('chat', body), 'chat'), (t) => delta({ content: t }))
  send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
  send({
    choices: [],
    usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110, completion_tokens_details: { reasoning_tokens: 17 } },
  })
  res.end('data: [DONE]\n\n')
}

async function anthropic(res, body) {
  const { model, messages, stream, ...params } = body
  const echoed = new Set()
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.content)) for (const b of m.content) if (b.type !== 'text') echoed.add(b.type)
  }
  const send = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`)
  send({
    type: 'message_start',
    message: { id: `msg_${count}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } },
  })
  send({ type: 'ping' })
  let index = 0
  if (model === 'mock-think') {
    send({ type: 'content_block_start', index, content_block: { type: 'redacted_thinking', data: blob(count) } })
    send({ type: 'content_block_stop', index: index++ })
  }
  if (model !== 'mock-tags') {
    send({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } })
    for (const ch of pieces(model)) {
      send({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: ch } })
      await sleep(pause(model))
    }
    send({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: `sig-${count}-` + 'x'.repeat(40) } })
    send({ type: 'content_block_stop', index: index++ })
  }
  send({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
  const line = echoLine({ protocol: 'anthropic', context: messages.length, echoed, params, users: userContents('anthropic', body) })
  await streamText(replyText(model, line, userContents('anthropic', body), 'anthropic'), (t) => send({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: t } }))
  send({ type: 'content_block_stop', index })
  send({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 100 } })
  send({ type: 'message_stop' })
  res.end()
}

async function responses(res, body) {
  const { model, input, stream, ...params } = body
  const echoed = new Set()
  for (const it of input) if (it.type) echoed.add(it.type)
  let seq = 0
  const send = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify({ ...o, sequence_number: seq++ })}\n\n`)
  const base = { id: `resp_${count}`, object: 'response', created_at: Math.floor(Date.now() / 1000), model }
  send({ type: 'response.created', response: { ...base, status: 'in_progress', output: [] } })
  const output = []
  if (model !== 'mock-tags') {
    const id = `rs_${count}`
    send({ type: 'response.output_item.added', output_index: 0, item: { id, type: 'reasoning', summary: [] } })
    // mock-think: two summary parts, as o-series models often send.
    const parts = model === 'mock-think' ? reasoning.split('\n\n') : [reasoningOf(model)]
    const summary = []
    for (const [summary_index, text] of parts.entries()) {
      send({ type: 'response.reasoning_summary_part.added', item_id: id, output_index: 0, summary_index, part: { type: 'summary_text', text: '' } })
      for (const ch of pieces(model, text)) {
        send({ type: 'response.reasoning_summary_text.delta', item_id: id, output_index: 0, summary_index, delta: ch })
        await sleep(pause(model))
      }
      send({ type: 'response.reasoning_summary_text.done', item_id: id, output_index: 0, summary_index, text })
      summary.push({ type: 'summary_text', text })
    }
    const item = { id, type: 'reasoning', summary, ...(model === 'mock-think' && { encrypted_content: blob(count) }) }
    send({ type: 'response.output_item.done', output_index: 0, item })
    output.push(item)
  }
  const oi = output.length
  const id = `msg_${count}`
  send({ type: 'response.output_item.added', output_index: oi, item: { id, type: 'message', status: 'in_progress', role: 'assistant', content: [] } })
  send({ type: 'response.content_part.added', item_id: id, output_index: oi, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
  const line = echoLine({ protocol: 'responses', context: input.length, echoed, params, users: userContents('responses', body) })
  const text = replyText(model, line, userContents('responses', body), 'responses')
  await streamText(text, (t) => send({ type: 'response.output_text.delta', item_id: id, output_index: oi, content_index: 0, delta: t }))
  send({ type: 'response.output_text.done', item_id: id, output_index: oi, content_index: 0, text })
  const part = { type: 'output_text', text, annotations: [] }
  send({ type: 'response.content_part.done', item_id: id, output_index: oi, content_index: 0, part })
  const msg = { id, type: 'message', status: 'completed', role: 'assistant', content: [part] }
  send({ type: 'response.output_item.done', output_index: oi, item: msg })
  output.push(msg)
  send({
    type: 'response.completed',
    response: {
      ...base,
      status: 'completed',
      output,
      usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 4 }, output_tokens: 100, output_tokens_details: { reasoning_tokens: 17 }, total_tokens: 110 },
    },
  })
  res.end()
}

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

    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    const protocol = req.url.endsWith('/v1/messages') ? 'anthropic' : req.url.endsWith('/responses') ? 'responses' : 'chat'
    count++
    const json = (status, o) => {
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json' })
      res.end(JSON.stringify(o))
    }
    if (body.model === 'mock-bad') return json(401, { error: { message: 'Authentication Fails (no such user)' } })
    if (protocol === 'anthropic' && body.max_tokens === undefined) {
      return json(400, { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: Field required' } })
    }

    try {
      for (const c of userContents(protocol, body)) userParts(protocol, c)
    } catch (e) {
      return json(400, { error: { type: 'invalid_request_error', message: e.message } })
    }

    if (body.model === 'mock-hang') return req.on('close', () => res.end())
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'X-Request-Id': `mock-${count}` })
    if (body.model === 'mock-empty') return res.end(protocol === 'chat' ? 'data: [DONE]\n\n' : '')
    if (body.model === 'mock-cut') {
      // Let ~60 events through, then kill the socket; later writes go nowhere.
      let writes = 0
      const write = res.write.bind(res)
      res.write = (...a) => (++writes === 60 ? (res.socket.destroy(), true) : writes > 60 ? true : write(...a))
    }
    await { chat, anthropic, responses }[protocol](res, body)
  })
  .listen(port, () => console.log(`mock LLM on http://localhost:${port}`))

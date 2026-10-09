import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { ChatNode, Protocol, Provider } from './db/types'
import { buildMessages } from './lib/chat'
import { maskImages } from './lib/images'
import { prepareChat, type ImagePayload } from './providers'

const provider = (protocol: Protocol): Provider => ({
  id: 'p',
  name: 'P',
  protocol,
  baseUrl: 'http://x',
  apiKey: 'k',
  models: ['m'],
  createdAt: 0,
})

const img = (id: string): ImagePayload => ({ id, mime: 'image/png', data: `BASE64-${id}` })
const payloads = new Map([img('a'), img('b')].map((p) => [p.id, p]))

const earlier: ChatNode = {
  id: 'n',
  conversationId: 'c',
  parentId: null,
  kind: 'main',
  createdAt: 0,
  user: { text: 'look', images: ['a'] },
  assistant: { content: 'a cat' },
  attempt: { status: 'done', providerId: 'p', providerName: 'P', protocol: 'openai-chat', model: 'm', url: '', startedAt: 0, rawText: 'a cat' },
}

function body(protocol: Protocol, text = 'and this?') {
  const p = provider(protocol)
  const msgs = buildMessages([earlier], text, { provider: p, model: 'm' }, { payloads, user: ['b'] })
  return prepareChat(p, 'm', msgs, { max_tokens: 10 }).body as Record<string, any>
}

describe('images in user messages', () => {
  it('openai-chat: image_url parts before the text', () => {
    const b = body('openai-chat')
    expect(b.messages[0].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BASE64-a' } },
      { type: 'text', text: 'look' },
    ])
    expect(b.messages[1]).toEqual({ role: 'assistant', content: 'a cat' })
    expect(b.messages[2].content[0].image_url.url).toBe('data:image/png;base64,BASE64-b')
  })

  it('anthropic: base64 image blocks', () => {
    const b = body('anthropic')
    expect(b.messages[2].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'BASE64-b' } },
      { type: 'text', text: 'and this?' },
    ])
  })

  it('openai-responses: input_image + input_text', () => {
    const b = body('openai-responses')
    expect(b.input[2]).toEqual({
      role: 'user',
      content: [
        { type: 'input_image', image_url: 'data:image/png;base64,BASE64-b' },
        { type: 'input_text', text: 'and this?' },
      ],
    })
  })

  it('image-only turn has no empty text part; turns without images stay plain strings', () => {
    expect(body('anthropic', '').messages[2].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'BASE64-b' } },
    ])
    const plain = buildMessages([{ ...earlier, user: { text: 'hi' } }], 'next')
    expect(plain[0]).toEqual({ role: 'user', content: 'hi' })
  })

  it('recorded body replaces image data with markers', () => {
    const masked = maskImages(body('openai-chat'), payloads.values()) as Record<string, any>
    expect(masked.messages[0].content[0].image_url.url).toBe('data:image/png;base64,[image:a]')
    expect(masked.messages[2].content[0].image_url.url).toBe('data:image/png;base64,[image:b]')
    expect(JSON.stringify(masked)).not.toContain('BASE64')
  })
})

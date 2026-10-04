export interface SseEvent {
  event?: string
  data: string
}

/** Incremental Server-Sent Events parser. Feed it text chunks, it returns complete events. */
export class SseParser {
  private buffer = ''

  push(chunk: string): SseEvent[] {
    this.buffer += chunk
    const events: SseEvent[] = []
    // Events are separated by a blank line; accept \n, \r\n and \r line endings.
    const blocks = this.buffer.split(/\r\n\r\n|\n\n|\r\r/)
    this.buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const ev = parseBlock(block)
      if (ev) events.push(ev)
    }
    return events
  }

  flush(): SseEvent[] {
    const ev = parseBlock(this.buffer)
    this.buffer = ''
    return ev ? [ev] : []
  }
}

function parseBlock(block: string): SseEvent | null {
  let event: string | undefined
  const data: string[] = []
  for (const line of block.split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith(':')) continue
    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    let value = idx === -1 ? '' : line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  if (data.length === 0) return null
  return { event, data: data.join('\n') }
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      yield* parser.push(decoder.decode(value, { stream: true }))
    }
    yield* parser.push(decoder.decode())
    yield* parser.flush()
  } finally {
    reader.releaseLock()
  }
}

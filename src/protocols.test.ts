import { afterEach, expect, it, vi } from "vitest";
import { endpoint, requestBody, streamAnswer } from "./api";
import type { EncryptedReasoning, Message, Provider } from "./types";
import {
  availableSources,
  hasMessageContent,
  isReplayable,
  usesSource,
} from "./encryptedReasoning";
import { append, createConversation, removeNode } from "./model";

const provider: Provider = {
  id: "p",
  name: "test",
  baseUrl: "https://example.com/v1",
  key: "test",
  model: "custom",
  remember: false,
  protocol: "responses",
  supportsEncryptedReasoning: true,
};
const user: Message = {
  id: "u",
  parent: null,
  role: "user",
  content: "你好",
  images: [],
};
const gpt: EncryptedReasoning = {
  source: "chatgpt",
  index: 0,
  contentOffset: 0,
  complete: true,
  payload: {
    type: "reasoning",
    id: "rs_1",
    summary: [{ type: "summary_text", text: "摘要" }],
    encrypted_content: "opaque-gpt",
  },
};
const claude: EncryptedReasoning = {
  source: "claude",
  index: 0,
  contentOffset: 0,
  complete: true,
  payload: { type: "thinking", thinking: "摘要", signature: "opaque-claude" },
};
const assistant = (blocks = [gpt, claude], content = "回答"): Message => ({
  id: "a",
  parent: "u",
  role: "assistant",
  content,
  images: [],
  encryptedReasoning: structuredClone(blocks),
});
afterEach(() => vi.unstubAllGlobals());
const sse = (events: unknown[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("");
function mockStream(events: unknown[]) {
  const encoded = new TextEncoder().encode(sse(events));
  const fetch = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (let i = 0; i < encoded.length; i += 7)
              c.enqueue(encoded.slice(i, i + 7));
            c.close();
          },
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
async function collect(p = provider) {
  let content = "",
    blocks: EncryptedReasoning[] = [];
  const snapshots: EncryptedReasoning[][] = [];
  let error: unknown;
  try {
    await streamAnswer(
      [user],
      p,
      new AbortController().signal,
      (text, _, encrypted) => {
        content += text;
        if (encrypted) {
          blocks = encrypted;
          snapshots.push(encrypted);
        }
      },
    );
  } catch (e) {
    error = e;
  }
  return { content, blocks, snapshots, error };
}

it("replays only the supported source and never uses server-side state", () => {
  const body = requestBody([user, assistant(), user], provider);
  expect(body.input.map((item: any) => item.type ?? item.role)).toEqual([
    "user",
    "reasoning",
    "assistant",
    "user",
  ]);
  expect(body.input[1]).toEqual(gpt.payload);
  expect(body.reasoning).toEqual({ summary: "auto" });
  expect(body.store).toBe(false);
  expect(body).not.toHaveProperty("previous_response_id");
  expect(body).not.toHaveProperty("conversation");
  expect(JSON.stringify(body)).not.toContain("opaque-claude");
  expect(
    JSON.stringify(requestBody([assistant()], provider, { chatgpt: false })),
  ).not.toContain("opaque-gpt");
  expect(
    JSON.stringify(
      requestBody([assistant()], {
        ...provider,
        supportsEncryptedReasoning: false,
      }),
    ),
  ).not.toContain("opaque-gpt");
  expect(
    JSON.stringify(
      requestBody([assistant()], { ...provider, protocol: "chat-completions" }),
    ),
  ).not.toContain("opaque");
});
it("preserves the ordering of several reasoning items around assistant text", () => {
  const second = {
    ...gpt,
    index: 2,
    contentOffset: 2,
    payload: { ...gpt.payload, id: "rs_2" },
  } as EncryptedReasoning;
  const body = requestBody([assistant([gpt, second], "甲乙丙丁")], provider);
  expect(body.input).toEqual([
    gpt.payload,
    { role: "assistant", content: "甲乙" },
    second.payload,
    { role: "assistant", content: "丙丁" },
  ]);
});
it("Anthropic separates system and translates images, signed and redacted thinking", () => {
  const redacted: EncryptedReasoning = {
    ...claude,
    index: 1,
    payload: { type: "redacted_thinking", data: "opaque-redacted" },
  };
  const p = {
    ...provider,
    protocol: "anthropic" as const,
    customParameters:
      '{"thinking":{"type":"adaptive"},"output_config":{"effort":"high"},"max_tokens":16000}',
  };
  const body = requestBody(
    [
      { ...user, role: "system", content: "system" },
      {
        ...user,
        images: [{ id: "i", name: "x.png", url: "data:image/png;base64,YQ==" }],
      },
      assistant([claude, redacted]),
    ],
    p,
  );
  expect(body.system).toBe("system");
  expect(body.max_tokens).toBe(16000);
  expect(body.thinking).toEqual({ type: "adaptive", display: "summarized" });
  expect(body.output_config).toEqual({ effort: "high" });
  expect(body.messages[0].content[1].source).toEqual({
    type: "base64",
    media_type: "image/png",
    data: "YQ==",
  });
  expect(body.messages[1].content).toEqual([
    claude.payload,
    redacted.payload,
    { type: "text", text: "回答" },
  ]);
  expect(
    requestBody([user], { ...p, customParameters: "" }),
  ).not.toHaveProperty("thinking");
});
it("Anthropic output length comes only from custom parameters", () => {
  const p = {
    ...provider,
    protocol: "anthropic" as const,
    customParameters: "",
  };
  expect(requestBody([user], p)).not.toHaveProperty("max_tokens");
  expect(
    requestBody([user], {
      ...p,
      customParameters: '{"max_tokens":128000}',
    }).max_tokens,
  ).toBe(128000);
});
it("filters incomplete ciphertext and no-body assistants without mutating stored messages", () => {
  const partial = { ...gpt, complete: false };
  const messages = [assistant([partial]), assistant([gpt], "")];
  const saved = structuredClone(messages);
  expect(requestBody(messages, provider).input).toHaveLength(1);
  expect(availableSources(messages)).toEqual([]);
  expect(messages).toEqual(saved);
  expect(hasMessageContent(messages[1])).toBe(true);
  expect(hasMessageContent(assistant([], ""))).toBe(false);
});
it("source preferences survive unsupported models and default to enabled", () => {
  expect(availableSources([assistant()])).toEqual(["chatgpt", "claude"]);
  expect(usesSource(provider, {}, "chatgpt")).toBe(true);
  expect(
    usesSource({ ...provider, protocol: "anthropic" }, {}, "chatgpt"),
  ).toBe(false);
  expect(usesSource(provider, { chatgpt: false }, "chatgpt")).toBe(false);
});
it("Responses accumulates summaries, saves final ciphertext and does not duplicate final text", async () => {
  const output = [
    gpt.payload,
    { type: "message", content: [{ type: "output_text", text: "你好" }] },
  ];
  mockStream([
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { type: "reasoning", id: "rs_1", summary: [] },
    },
    {
      type: "response.reasoning_summary_text.delta",
      output_index: 0,
      summary_index: 0,
      delta: "摘要",
    },
    { type: "response.output_item.done", output_index: 0, item: gpt.payload },
    { type: "response.output_text.delta", output_index: 1, delta: "你好" },
    { type: "response.output_text.done", output_index: 1, text: "你好" },
    { type: "response.completed", response: { output } },
  ]);
  const result = await collect();
  expect(result.error).toBeUndefined();
  expect(result.content).toBe("你好");
  expect(result.blocks).toEqual([gpt]);
  expect(
    result.snapshots.some((snapshot) => snapshot[0]?.complete === false),
  ).toBe(true);
  expect(result.snapshots[1][0].payload).toMatchObject({
    summary: [{ text: "摘要" }],
  });
});
it("supports final-only Responses output, preserving multiple blocks and offsets", async () => {
  mockStream([
    {
      type: "response.completed",
      response: {
        output: [
          { type: "message", content: [{ type: "output_text", text: "前半" }] },
          gpt.payload,
          { type: "message", content: [{ type: "output_text", text: "后半" }] },
        ],
      },
    },
  ]);
  const result = await collect();
  expect(result.content).toBe("前半后半");
  expect(result.blocks[0].contentOffset).toBe(2);
});
it("keeps a streamed summary when Responses disconnects before encrypted content", async () => {
  mockStream([
    {
      type: "response.reasoning_summary_text.delta",
      output_index: 0,
      delta: "半截摘要",
    },
  ]);
  const result = await collect();
  expect(String(result.error)).toContain("连接中断");
  expect(result.blocks[0].complete).toBe(false);
  expect(result.blocks[0].payload).toMatchObject({
    summary: [{ text: "半截摘要" }],
  });
});
it("Anthropic joins signature deltas, preserves redacted blocks and sends native headers", async () => {
  const fetch = mockStream([
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "", signature: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "摘要" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "opaque-" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "claude" },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "redacted_thinking", data: "redacted" },
    },
    { type: "content_block_stop", index: 1 },
    {
      type: "content_block_start",
      index: 2,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 2,
      delta: { type: "text_delta", text: "正文" },
    },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
    { type: "message_stop" },
  ]);
  const result = await collect({ ...provider, protocol: "anthropic" });
  expect(result.error).toBeUndefined();
  expect(result.content).toBe("正文");
  expect(result.blocks[0]).toEqual(claude);
  expect(result.blocks[1].payload).toEqual({
    type: "redacted_thinking",
    data: "redacted",
  });
  expect(result.blocks.every(isReplayable)).toBe(true);
  const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
  expect(init.headers).toMatchObject({
    "x-api-key": "test",
    "anthropic-version": "2023-06-01",
  });
  expect(init.headers).not.toHaveProperty("Authorization");
});
it("never replays an Anthropic signature received before its block finishes", async () => {
  mockStream([
    { type: "content_block_start", index: 0, content_block: claude.payload },
  ]);
  const result = await collect({ ...provider, protocol: "anthropic" });
  expect(String(result.error)).toContain("连接中断");
  expect(isReplayable(result.blocks[0])).toBe(false);
});
it.each(["response.failed", "response.incomplete"])(
  "reports %s without retrying",
  async (type) => {
    const fetch = mockStream([
      {
        type,
        response: {
          error: { message: "provider error" },
          incomplete_details: { reason: "max_output_tokens" },
        },
      },
    ]);
    const result = await collect();
    expect(result.error).toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it("supports multi-line SSE data and event names", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        'event: message_stop\ndata: {\ndata: "type":"message_stop"}\n\n',
      ),
  );
  expect(
    (await collect({ ...provider, protocol: "anthropic" })).error,
  ).toBeUndefined();
});
it("deleting an assistant also removes its encrypted payload and descendants", () => {
  const c = createConversation();
  const u = append(c, c.root, "user", "问");
  const a = append(c, u.id, "assistant", "答");
  a.encryptedReasoning = [gpt];
  const child = append(c, a.id, "user", "继续");
  removeNode(c, a.id);
  expect(c.nodes[a.id]).toBeUndefined();
  expect(c.nodes[child.id]).toBeUndefined();
  expect(JSON.stringify(c)).not.toContain("opaque-gpt");
});
it("normalizes native API roots and preserves custom base paths", () => {
  expect(
    endpoint({ ...provider, baseUrl: "https://api.openai.com" }).href,
  ).toBe("https://api.openai.com/v1/responses");
  expect(
    endpoint({
      ...provider,
      protocol: "anthropic",
      baseUrl: "https://example.com/proxy/v1/",
    }).href,
  ).toBe("https://example.com/proxy/v1/messages");
});

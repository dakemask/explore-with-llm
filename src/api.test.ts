import { it, expect, vi, afterEach } from "vitest";
import { streamAnswer, requestBody } from "./api";
import type { Message, Provider } from "./types";
const p: Provider = {
  id: "ds",
  name: "DS",
  baseUrl: "https://api.deepseek.com",
  key: "test",
  model: "deepseek-flash",
  remember: false,
};
const messages: Message[] = [
  {
    id: "u",
    role: "user",
    parent: null,
    content: "图片",
    images: [{ id: "i", name: "x.png", url: "data:image/png;base64,YQ==" }],
  },
];
afterEach(() => vi.unstubAllGlobals());
it("sends native image input and omits reasoning history", () => {
  const body = requestBody(messages, p);
  expect(body.messages[0].content).toEqual([
    { type: "text", text: "图片" },
    { type: "image_url", image_url: { url: messages[0].images[0].url } },
  ]);
  expect(body).not.toHaveProperty("reasoning_effort");
});
it("handles fragmented UTF-8/SSE and returns reasoning separately", async () => {
  const encoded = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"reasoning_content":"想"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"回答"}}]}\n\ndata: [DONE]\n\n',
  );
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (let i = 0; i < encoded.length; i += 3)
              c.enqueue(encoded.slice(i, i + 3));
            c.close();
          },
        }),
      ),
  );
  let content = "",
    reasoning = "";
  await streamAnswer(messages, p, new AbortController().signal, (a, b) => {
    content += a;
    reasoning += b;
  });
  expect(content).toBe("回答");
  expect(reasoning).toBe("想");
});
it("reports a truncated stream instead of silently marking complete", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response('data: {"choices":[{"delta":{"content":"半句"}}]}\n\n'),
  );
  await expect(
    streamAnswer(messages, p, new AbortController().signal, () => {}),
  ).rejects.toThrow("连接中断");
});
it("preserves provider context-limit errors", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response('{"error":{"message":"maximum context length exceeded"}}', {
        status: 400,
      }),
  );
  await expect(
    streamAnswer(messages, p, new AbortController().signal, () => {}),
  ).rejects.toThrow("maximum context");
});

it.each(["none", "low", "high", "max"] as const)(
  "sends only custom effort %s",
  (effort) => {
    expect(
      requestBody(messages, {
        ...p,
        customParameters: JSON.stringify({ reasoning_effort: effort }),
      }).reasoning_effort,
    ).toBe(effort);
  },
);

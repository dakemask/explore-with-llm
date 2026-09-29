import type { Message, Provider, Effort } from "./types";
export function requestBody(
  messages: Message[],
  provider: Provider,
  thinking: Effort | boolean,
) {
  return {
    model: provider.model,
    stream: true,
    reasoning_effort:
      typeof thinking === "boolean" ? (thinking ? "high" : "none") : thinking,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.images.length
        ? [
            { type: "text", text: m.content },
            ...m.images.map((image) => ({
              type: "image_url",
              image_url: { url: image.url },
            })),
          ]
        : m.content,
    })),
  };
}
export async function streamAnswer(
  messages: Message[],
  provider: Provider,
  thinking: Effort | boolean,
  signal: AbortSignal,
  onDelta: (content: string, reasoning: string) => void,
) {
  if (!provider.key.trim()) throw new Error("请先在模型设置中填写 API Key");
  const base = provider.baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/chat/completions`);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("提供商地址需要 HTTPS");
  const body = JSON.stringify(requestBody(messages, provider, thinking));
  if (new Blob([body]).size > 48 * 1024 * 1024)
    throw new Error("图片和历史超过 48 MiB 请求限制");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.key}`,
    },
    body,
    signal,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error?.message ?? `请求失败（${response.status}）`);
  }
  if (!response.body) throw new Error("提供商未返回响应流");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    completed = false;
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      completed = true;
      return;
    }
    const event = JSON.parse(data);
    if (event.error) throw new Error(event.error.message ?? "生成失败");
    const choice = event.choices?.[0];
    const delta = choice?.delta;
    if (delta) onDelta(delta.content ?? "", delta.reasoning_content ?? "");
    if (choice?.finish_reason === "length")
      throw new Error("输出达到模型长度上限");
    if (
      choice?.finish_reason &&
      !["stop", "length"].includes(choice.finish_reason)
    )
      throw new Error(`生成结束：${choice.finish_reason}`);
    if (choice?.finish_reason === "stop") completed = true;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let index;
      while ((index = buffer.indexOf("\n")) !== -1) {
        consume(buffer.slice(0, index).replace(/\r$/, ""));
        buffer = buffer.slice(index + 1);
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!completed) throw new Error("连接中断，回答未完成");
  } finally {
    reader.releaseLock();
  }
}

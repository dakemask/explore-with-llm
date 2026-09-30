import type {
  EncryptedReasoning,
  Message,
  Provider,
  ReasoningPreferences,
  ReasoningPayload,
} from "./types";
import { mergeJson, type JsonObject } from "./budget";
import { parameterRequest } from "./parameters";
import {
  canUseAsContext,
  isReplayable,
  usesSource,
} from "./encryptedReasoning";

function replayBlocks(
  message: Message,
  provider: Provider,
  preferences: ReasoningPreferences,
) {
  return (message.encryptedReasoning ?? [])
    .filter(
      (b) => isReplayable(b) && usesSource(provider, preferences, b.source),
    )
    .sort((a, b) => a.index - b.index);
}

// Preserve text / reasoning order while keeping immutable payloads through edits.
function orderedContent(
  message: Message,
  blocks: EncryptedReasoning[],
  text: (s: string) => unknown,
): unknown[] {
  const result: unknown[] = [];
  let cursor = 0;
  for (const block of blocks) {
    const offset = Math.max(
      cursor,
      Math.min(message.content.length, block.contentOffset),
    );
    if (offset > cursor)
      result.push(text(message.content.slice(cursor, offset)));
    result.push(structuredClone(block.payload));
    cursor = offset;
  }
  if (cursor < message.content.length)
    result.push(text(message.content.slice(cursor)));
  return result;
}

export function requestBody(
  messages: Message[],
  provider: Provider,
  preferences: ReasoningPreferences = {},
) {
  const parameters = parameterRequest(
    provider.customParameters ?? "",
    provider.parameterState,
  ).body;
  const history = messages.filter(canUseAsContext);
  const protocol = provider.protocol ?? "chat-completions";
  // The three native request schemas deliberately differ at the transport boundary.
  const body: Record<string, any> = { model: provider.model, stream: true };
  if (protocol === "responses") {
    body.store = false;
    body.include = ["reasoning.encrypted_content"];
    body.reasoning = { summary: "auto" };
    body.input = history.flatMap((m) => {
      if (m.role === "assistant")
        return orderedContent(
          m,
          replayBlocks(m, provider, preferences),
          (text) => ({ role: "assistant", content: text }),
        );
      return [
        {
          role: m.role,
          content: [
            ...(m.content ? [{ type: "input_text", text: m.content }] : []),
            ...m.images.map((image) => ({
              type: "input_image",
              image_url: image.url,
              detail: "auto",
            })),
          ],
        },
      ];
    });
  } else if (protocol === "anthropic") {
    const system = history
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .filter(Boolean)
      .join("\n\n");
    if (system) body.system = system;
    body.messages = history
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role,
        content: [
          ...orderedContent(
            m,
            m.role === "assistant"
              ? replayBlocks(m, provider, preferences)
              : [],
            (text) => ({ type: "text", text }),
          ),
          ...m.images.map((image) => {
            const data = /^data:(image\/[^;]+);base64,(.*)$/s.exec(image.url);
            return {
              type: "image",
              source: data
                ? { type: "base64", media_type: data[1], data: data[2] }
                : { type: "url", url: image.url },
            };
          }),
        ],
      }));
  } else {
    body.messages = history.map((m) => ({
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
    }));
  }
  mergeJson(body as JsonObject, parameters);
  if (
    protocol === "anthropic" &&
    ["adaptive", "enabled"].includes(body.thinking?.type)
  )
    body.thinking.display = "summarized";
  return body;
}

export function endpoint(provider: Provider) {
  let base = provider.baseUrl.replace(/\/+$/, "");
  const protocol = provider.protocol ?? "chat-completions";
  const parsed = new URL(base);
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
  )
    throw new Error("提供商地址需要 HTTPS");
  if (protocol !== "chat-completions" && parsed.pathname === "/") base += "/v1";
  return new URL(
    `${base}/${protocol === "responses" ? "responses" : protocol === "anthropic" ? "messages" : "chat/completions"}`,
  );
}

export async function streamAnswer(
  messages: Message[],
  provider: Provider,
  signal: AbortSignal,
  onDelta: (
    content: string,
    reasoning: string,
    encrypted?: EncryptedReasoning[],
  ) => void,
  preferences: ReasoningPreferences = {},
) {
  if (!provider.key.trim()) throw new Error("请先在模型设置中填写 API Key");
  const protocol = provider.protocol ?? "chat-completions";
  const body = JSON.stringify(requestBody(messages, provider, preferences));
  if (new Blob([body]).size > 48 * 1024 * 1024)
    throw new Error("图片和历史超过 48 MiB 请求限制");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (protocol === "anthropic")
    Object.assign(headers, {
      "x-api-key": provider.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
  else headers.Authorization = `Bearer ${provider.key}`;
  const response = await fetch(endpoint(provider), {
    method: "POST",
    headers,
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
    dataLines: string[] = [],
    eventName = "",
    completed = false,
    contentLength = 0;
  const blocks = new Map<number, EncryptedReasoning>();
  const texts = new Map<string, string>();
  const emitBlocks = () =>
    onDelta(
      "",
      "",
      structuredClone([...blocks.values()].sort((a, b) => a.index - b.index)),
    );
  const emitText = (key: string, text: string, final = false) => {
    const previous = texts.get(key) ?? "";
    const next = final ? text : previous + text;
    const delta = final
      ? next.startsWith(previous)
        ? next.slice(previous.length)
        : ""
      : text;
    texts.set(key, next);
    if (delta) {
      contentLength += delta.length;
      onDelta(delta, "");
    }
  };
  const responseItem = (
    index: number,
    item: any,
    done: boolean,
    offset?: number,
  ) => {
    if (item.type === "reasoning") {
      const old = blocks.get(index);
      const payload: ReasoningPayload = {
        type: "reasoning",
        ...(item.id ? { id: item.id } : {}),
        summary: item.summary ?? [],
        ...(item.encrypted_content
          ? { encrypted_content: item.encrypted_content }
          : {}),
      };
      blocks.set(index, {
        source: "chatgpt",
        index,
        contentOffset: offset ?? old?.contentOffset ?? contentLength,
        payload,
        complete: (done || !!old?.complete) && item.status !== "incomplete",
      });
      emitBlocks();
    } else if (item.type === "message") {
      for (const [i, part] of (item.content ?? []).entries()) {
        if (part.type === "output_text")
          emitText(`${index}:${i}`, part.text ?? "", true);
        if (part.type === "refusal")
          emitText(`${index}:${i}`, part.refusal ?? "", true);
      }
    }
  };
  const consume = (event: any) => {
    if (event.error || event.type === "error")
      throw new Error(event.error?.message ?? event.message ?? "生成失败");
    if (protocol === "chat-completions") {
      const choice = event.choices?.[0],
        delta = choice?.delta;
      if (delta) onDelta(delta.content ?? "", delta.reasoning_content ?? "");
      if (choice?.finish_reason === "length")
        throw new Error("输出达到模型长度上限");
      if (choice?.finish_reason && choice.finish_reason !== "stop")
        throw new Error(`生成结束：${choice.finish_reason}`);
      if (choice?.finish_reason === "stop") completed = true;
      return;
    }
    if (protocol === "responses") {
      const type = event.type,
        index = event.output_index ?? 0;
      if (
        type === "response.output_item.added" ||
        type === "response.output_item.done"
      )
        responseItem(index, event.item, type.endsWith(".done"));
      if (
        type === "response.output_text.delta" ||
        type === "response.refusal.delta"
      )
        emitText(`${index}:${event.content_index ?? 0}`, event.delta ?? "");
      if (
        type === "response.output_text.done" ||
        type === "response.refusal.done"
      )
        emitText(
          `${index}:${event.content_index ?? 0}`,
          event.text ?? event.refusal ?? "",
          true,
        );
      if (type?.startsWith("response.reasoning_summary_")) {
        let block = blocks.get(index);
        if (!block) {
          block = {
            source: "chatgpt",
            index,
            contentOffset: contentLength,
            complete: false,
            payload: { type: "reasoning", id: event.item_id, summary: [] },
          };
          blocks.set(index, block);
        }
        if (block.payload.type === "reasoning") {
          const i = event.summary_index ?? 0;
          if (
            type === "response.reasoning_summary_part.added" ||
            type === "response.reasoning_summary_part.done"
          )
            block.payload.summary[i] = {
              type: "summary_text",
              text: event.part?.text ?? "",
            };
          if (type === "response.reasoning_summary_text.delta") {
            const part = block.payload.summary[i] ?? {
              type: "summary_text",
              text: "",
            };
            part.text += event.delta ?? "";
            block.payload.summary[i] = part;
          }
          if (type === "response.reasoning_summary_text.done")
            block.payload.summary[i] = {
              type: "summary_text",
              text: event.text ?? "",
            };
          emitBlocks();
        }
      }
      if (
        [
          "response.completed",
          "response.incomplete",
          "response.failed",
        ].includes(type)
      ) {
        let offset = 0;
        for (const [i, item] of (event.response?.output ?? []).entries()) {
          responseItem(
            i,
            item,
            type === "response.completed" || item.status === "completed",
            offset,
          );
          if (item.type === "message")
            offset += (item.content ?? []).reduce(
              (size: number, part: any) =>
                size + (part.text ?? part.refusal ?? "").length,
              0,
            );
        }
        if (type === "response.failed")
          throw new Error(event.response?.error?.message ?? "生成失败");
        if (type === "response.incomplete")
          throw new Error(
            `回答未完成：${event.response?.incomplete_details?.reason ?? "输出达到上限"}`,
          );
        completed = true;
      }
      return;
    }
    const index = event.index ?? 0;
    if (event.type === "content_block_start") {
      const payload = event.content_block;
      if (["thinking", "redacted_thinking"].includes(payload.type)) {
        blocks.set(index, {
          source: "claude",
          index,
          contentOffset: contentLength,
          complete: false,
          payload: structuredClone(payload),
        });
        emitBlocks();
      } else if (payload.type === "text")
        emitText(String(index), payload.text ?? "");
    }
    if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta.type === "text_delta")
        emitText(String(index), delta.text ?? "");
      const block = blocks.get(index);
      if (block?.payload.type === "thinking") {
        if (delta.type === "thinking_delta")
          block.payload.thinking =
            (block.payload.thinking ?? "") + (delta.thinking ?? "");
        if (delta.type === "signature_delta")
          block.payload.signature =
            (block.payload.signature ?? "") + (delta.signature ?? "");
        emitBlocks();
      }
    }
    if (event.type === "content_block_stop" && blocks.has(index)) {
      blocks.get(index)!.complete = true;
      emitBlocks();
    }
    if (event.type === "message_delta") {
      const reason = event.delta?.stop_reason;
      if (reason === "max_tokens" || reason === "model_context_window_exceeded")
        throw new Error("输出达到模型长度或上下文上限");
      if (reason && !["end_turn", "stop_sequence", "refusal"].includes(reason))
        throw new Error(`生成结束：${reason}`);
    }
    if (event.type === "message_stop") completed = true;
  };
  const dispatch = () => {
    if (!dataLines.length) {
      eventName = "";
      return;
    }
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (data === "[DONE]") {
      if (protocol === "chat-completions") completed = true;
      eventName = "";
      return;
    }
    const event = JSON.parse(data);
    if (!event.type && eventName) event.type = eventName;
    eventName = "";
    consume(event);
  };
  const line = (text: string) => {
    if (!text) dispatch();
    else if (text.startsWith("data:"))
      dataLines.push(text.slice(5).replace(/^ /, ""));
    else if (text.startsWith("event:")) eventName = text.slice(6).trim();
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let index: number;
      while ((index = buffer.indexOf("\n")) !== -1) {
        line(buffer.slice(0, index).replace(/\r$/, ""));
        buffer = buffer.slice(index + 1);
      }
      if (done || completed) break;
    }
    if (buffer.trim()) line(buffer.replace(/\r$/, ""));
    dispatch();
    if (!completed) throw new Error("连接中断，回答未完成");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

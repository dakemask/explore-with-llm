import type { Provider } from "./types";
import { endpoint } from "./api";
export function modelsEndpoint(provider: Provider) {
  const url = endpoint(provider);
  url.pathname = url.pathname.replace(
    /\/(chat\/completions|responses|messages)$/,
    "/models",
  );
  return url;
}
export async function fetchModels(
  provider: Provider,
  signal: AbortSignal,
): Promise<string[]> {
  const url = modelsEndpoint(provider),
    headers: Record<string, string> = {};
  if (!provider.key.trim()) throw new Error("请填写 API Key");
  if (provider.protocol === "anthropic") {
    headers["x-api-key"] = provider.key;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
    url.searchParams.set("limit", "1000");
  } else headers.Authorization = "Bearer " + provider.key;
  const ids = new Set<string>(),
    cursors = new Set<string>();
  while (true) {
    const response = await fetch(url, { headers, signal });
    if (!response.ok)
      throw new Error(
        "获取模型失败：" +
          response.status +
          " " +
          (await response.text()).slice(0, 400),
      );
    const body = await response.json();
    if (!Array.isArray(body.data))
      throw new Error("模型列表响应缺少 data 数组");
    for (const model of body.data)
      if (typeof model.id === "string" && model.id.trim()) ids.add(model.id);
    if (provider.protocol !== "anthropic" || !body.has_more) break;
    if (typeof body.last_id !== "string" || cursors.has(body.last_id))
      throw new Error("模型列表分页游标无效");
    cursors.add(body.last_id);
    url.searchParams.set("after_id", body.last_id);
  }
  return [...ids];
}

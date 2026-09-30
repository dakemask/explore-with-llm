import type { BudgetSettings } from "./types";

export const FIXED_EFFORT = "__configured__";
export const effortLabel = (value: string) =>
  value === FIXED_EFFORT ? "使用配置" : value || "不指定";
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue =
  string | number | boolean | null | JsonValue[] | JsonObject;
const object = (v: JsonValue): v is JsonObject =>
  !!v && typeof v === "object" && !Array.isArray(v);
const reserved = new Set([
  "model",
  "messages",
  "input",
  "system",
  "instructions",
  "stream",
  "stream_options",
  "store",
  "include",
  "previous_response_id",
  "conversation",
  "background",
  "tools",
  "tool_choice",
]);

function inspect(value: JsonValue, path: string[] = []): boolean {
  if (Array.isArray(value))
    return value.map((v) => inspect(v, path)).some(Boolean);
  if (!object(value)) {
    if (
      typeof value === "string" &&
      value.includes("EFFORT") &&
      value !== "EFFORT"
    )
      throw new Error("EFFORT 必须是完整的 JSON 字符串值，不能嵌在其他文字中");
    return value === "EFFORT";
  }
  let placeholder = false;
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      key.includes("EFFORT")
    )
      throw new Error(`不能使用字段 ${next.join(".")}`);
    if (
      (!path.length && reserved.has(key)) ||
      [
        "reasoning.summary",
        "reasoning.context",
        "thinking.display",
        "thinking.block_binding",
      ].includes(next.join("."))
    )
      throw new Error(`不能覆盖由应用管理的字段 ${next.join(".")}`);
    if (inspect(child, next)) placeholder = true;
  }
  return placeholder;
}

// Deep merge retains sibling fields such as reasoning.summary. Conflicting leaves
// are rejected so a pasted fragment can never silently change another fragment.
export function mergeJson(
  target: JsonObject,
  source: JsonObject,
  prefix = "",
): JsonObject {
  for (const [key, value] of Object.entries(source)) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (Object.hasOwn(target, key)) {
      if (object(target[key]) && object(value))
        mergeJson(target[key], value, at);
      else if (JSON.stringify(target[key]) !== JSON.stringify(value))
        throw new Error(`设置冲突：${at}`);
    } else target[key] = structuredClone(value);
  }
  return target;
}

export function parseBudget(budget: BudgetSettings) {
  const levels = [
    ...new Set(budget.levels.trim().split(/\s+/).filter(Boolean)),
  ];
  if (levels.includes(FIXED_EFFORT) || levels.includes("不指定"))
    throw new Error("档位名称与内置选项冲突");
  if (!budget.template.trim())
    return { template: {} as JsonObject, levels, placeholder: false };
  const template: JsonObject = {};
  let placeholder = false;
  for (const [i, fragment] of budget.template.split(/^\s*---\s*$/m).entries()) {
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(fragment);
    } catch {
      throw new Error(`第 ${i + 1} 段不是有效 JSON 对象`);
    }
    if (!object(parsed)) throw new Error(`第 ${i + 1} 段必须是 JSON 对象`);
    placeholder = inspect(parsed) || placeholder;
    mergeJson(template, parsed);
  }
  if (placeholder && !levels.length)
    throw new Error("模板使用了 EFFORT，请填写至少一个档位");
  return { template, levels, placeholder };
}

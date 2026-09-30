import { mergeJson, parseBudget, type JsonObject } from "./budget";
import type { ParameterState } from "./types";

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | {
      param: string;
      enabled?: boolean;
      value?: string | number;
      op?: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte";
      values?: (string | number)[];
    };
export interface Parameter {
  id: string;
  name: string;
  description?: string;
  type: "choice" | "number" | "fixed";
  toggle: boolean;
  enabled: boolean;
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
  when?: Condition;
  inactive?: { enabled?: boolean; value?: string | number };
  options: { id: string; label: string; request: JsonObject }[];
  request: JsonObject;
  raw?: boolean;
}
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function json(text: string, location: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(location + "：JSON 格式错误");
  }
}
function request(text: string, location: string): JsonObject {
  const v = json(text, location);
  if (!isObject(v)) throw new Error(location + "：请求片段必须是 JSON 对象");
  function checkKeys(value: unknown) {
    if (Array.isArray(value)) value.forEach(checkKeys);
    else if (isObject(value))
      for (const [key, child] of Object.entries(value)) {
        if (key === "VALUE")
          throw new Error(location + "：VALUE 不能用作对象键");
        checkKeys(child);
      }
  }
  checkKeys(v);
  parseBudget({ template: JSON.stringify(v), levels: "", selected: "" });
  return v as JsonObject;
}
function refs(c: Condition): string[] {
  if ("all" in c) return c.all.flatMap(refs);
  if ("any" in c) return c.any.flatMap(refs);
  return [c.param];
}
function validateCondition(c: unknown): asserts c is Condition {
  if (!isObject(c)) throw new Error("依赖条件必须是对象");
  if ("all" in c || "any" in c) {
    const key = "all" in c ? "all" : "any";
    if (Object.keys(c).length !== 1 || !Array.isArray(c[key]) || !c[key].length)
      throw new Error("all/any 必须是非空条件数组");
    c[key].forEach(validateCondition);
    return;
  }
  if (
    typeof c.param !== "string" ||
    !c.param ||
    Object.keys(c).some(
      (k) => !["param", "enabled", "value", "op", "values"].includes(k),
    )
  )
    throw new Error("依赖需要 param，且不能包含未知字段");
  if ("enabled" in c && typeof c.enabled !== "boolean")
    throw new Error("enabled 必须是布尔值");
  if (!("enabled" in c) && !("value" in c) && !("values" in c))
    throw new Error("依赖缺少比较条件");
  if (
    c.op &&
    !["eq", "ne", "in", "gt", "gte", "lt", "lte"].includes(String(c.op))
  )
    throw new Error("未知依赖比较符");
  if (c.op === "in" && (!Array.isArray(c.values) || !c.values.length))
    throw new Error("in 需要非空 values 数组");
  if ("values" in c && c.op !== "in") throw new Error("values 必须搭配 op=in");
  if (
    "value" in c &&
    typeof c.value !== "string" &&
    typeof c.value !== "number"
  )
    throw new Error("value 必须是字符串或数字");
  if (
    "values" in c &&
    (!Array.isArray(c.values) ||
      c.values.some((v) => typeof v !== "string" && typeof v !== "number"))
  )
    throw new Error("values 必须是字符串或数字数组");
  if (c.op && c.op !== "in" && !("value" in c))
    throw new Error("比较缺少 value");
  if (
    ["gt", "gte", "lt", "lte"].includes(String(c.op)) &&
    typeof c.value !== "number"
  )
    throw new Error("数值比较需要数字 value");
}
function leaves(v: JsonObject, prefix = ""): string[] {
  return Object.entries(v).flatMap(([k, child]) => {
    const at = prefix ? prefix + "." + k : k;
    return isObject(child) && Object.keys(child).length
      ? leaves(child as JsonObject, at)
      : [at];
  });
}
function validValue(p: Parameter, value: unknown) {
  if (p.type === "choice") return p.options.some((o) => o.id === value);
  if (p.type === "fixed") return value === "fixed";
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= p.min! &&
    value <= p.max! &&
    Math.abs(
      (value - p.min!) / p.step! - Math.round((value - p.min!) / p.step!),
    ) < 1e-7
  );
}
export function parseParameters(text: string): Parameter[] {
  const parameters: Parameter[] = [];
  for (const [index, fragment] of text.split(/^\s*---\s*$/m).entries()) {
    const part = fragment.trim();
    if (!part) continue;
    const location = "第 " + (index + 1) + " 段";
    if (part.startsWith("{")) {
      const body = request(part, location);
      function addRaw(v: JsonObject, path: string[] = []) {
        for (const [key, child] of Object.entries(v)) {
          const next = [...path, key];
          if (isObject(child) && Object.keys(child).length) {
            addRaw(child as JsonObject, next);
            continue;
          }
          const fragment: JsonObject = next.reduceRight<JsonObject>(
            (value, k) => ({ [k]: value }),
            child as JsonObject,
          );
          parameters.push({
            id: "_raw_" + JSON.stringify(next),
            name: "固定请求 " + next.join("."),
            type: "fixed",
            toggle: false,
            enabled: true,
            default: "fixed",
            options: [],
            request: fragment,
            raw: true,
          });
        }
      }
      addRaw(body);
      continue;
    }
    const lines = part.split(/\r?\n/);
    const header = /^@param\s+([A-Za-z][\w-]*)$/.exec(lines.shift()!.trim());
    if (!header)
      throw new Error(location + "：需要 @param 参数ID 或 JSON 对象");
    if (["constructor", "prototype", "__proto__"].includes(header[1]))
      throw new Error(location + "：不能使用此参数 ID");
    const fields: Record<string, unknown> = {},
      options: Parameter["options"] = [];
    for (let line = 0; line < lines.length; line++) {
      const raw = lines[line].trim();
      if (!raw || raw.startsWith("#")) continue;
      const option =
        /^option\s+([\w-]+)\s+("(?:[^"\\]|\\.)*")\s*=>\s*(.*)$/.exec(raw);
      if (option) {
        let body = option[3];
        while (line + 1 < lines.length) {
          try {
            JSON.parse(body);
            break;
          } catch {
            body += "\n" + lines[++line];
          }
        }
        options.push({
          id: option[1],
          label: json(option[2], location),
          request: request(body, location),
        });
        continue;
      }
      const field = /^(\w+)\s*=\s*(.+)$/.exec(raw);
      if (!field)
        throw new Error(location + " 第 " + (line + 2) + " 行：无法识别声明");
      const key = field[1];
      let value = field[2];
      if (
        ![
          "name",
          "description",
          "type",
          "toggle",
          "enabled",
          "default",
          "min",
          "max",
          "step",
          "when",
          "inactive",
          "request",
        ].includes(key)
      )
        throw new Error(location + "：未知声明 " + key);
      if (key in fields) throw new Error(location + "：重复声明 " + key);
      if (value.startsWith("{") || value.startsWith("[")) {
        while (line + 1 < lines.length) {
          try {
            JSON.parse(value);
            break;
          } catch {
            value += "\n" + lines[++line];
          }
        }
      }
      fields[key] =
        /^[A-Za-z][\w-]*$/.test(value) &&
        !["true", "false", "null"].includes(value)
          ? value
          : json(value, location);
    }
    const p = {
      id: header[1],
      name: header[1],
      type: "fixed",
      toggle: false,
      enabled: true,
      default: "fixed",
      options,
      request: {},
      ...fields,
    } as Parameter;
    if (!["choice", "number", "fixed"].includes(p.type))
      throw new Error(location + "：未知类型");
    if (
      typeof p.name !== "string" ||
      !p.name.trim() ||
      typeof p.toggle !== "boolean" ||
      typeof p.enabled !== "boolean"
    )
      throw new Error(location + "：name/toggle/enabled 类型错误");
    if (!p.toggle && !p.enabled)
      throw new Error(location + "：无开关参数不能默认关闭");
    if (p.type === "choice") {
      if (
        !options.length ||
        new Set(options.map((o) => o.id)).size !== options.length
      )
        throw new Error(location + "：选项为空或 ID 重复");
    } else if (options.length)
      throw new Error(location + "：只有 choice 可以声明 option");
    if (p.type === "number") {
      if (
        ![p.min, p.max, p.step, p.default].every(
          (v) => typeof v === "number" && Number.isFinite(v),
        ) ||
        p.min! > p.max! ||
        p.step! <= 0
      )
        throw new Error(location + "：请填写有效数值范围、步长和默认值");
    }
    if (!validValue(p, p.default)) throw new Error(location + "：默认值无效");
    if (p.when) validateCondition(p.when);
    if (p.inactive) {
      if (
        !isObject(p.inactive) ||
        Object.keys(p.inactive).some(
          (k) => !["enabled", "value"].includes(k),
        ) ||
        ("enabled" in p.inactive && typeof p.inactive.enabled !== "boolean") ||
        ("value" in p.inactive && !validValue(p, p.inactive.value))
      )
        throw new Error(location + "：inactive 状态无效");
    }
    p.request = request(JSON.stringify(p.request), location);
    if (p.type === "choice" && Object.keys(p.request).length)
      throw new Error(location + "：choice 请在 option 中填写请求");
    const hasValue = (v: unknown): boolean =>
      v === "VALUE" ||
      (Array.isArray(v)
        ? v.some(hasValue)
        : isObject(v) && Object.values(v).some(hasValue));
    if (
      p.type !== "number" &&
      [p.request, ...options.map((o) => o.request)].some(hasValue)
    )
      throw new Error(location + "：VALUE 仅用于 number");
    if (p.type === "number" && !hasValue(p.request))
      throw new Error(location + "：数值请求需要 VALUE 占位");
    parameters.push(p);
  }
  if (
    new Set(parameters.map((p) => p.id)).size !== parameters.length ||
    new Set(parameters.map((p) => p.name)).size !== parameters.length
  )
    throw new Error("参数 ID 和名称必须分别唯一");
  const paths: { path: string; owner: string }[] = [];
  for (const p of parameters) {
    for (const path of new Set(
      [p.request, ...p.options.map((o) => o.request)].flatMap((v) => leaves(v)),
    )) {
      const conflict = paths.find(
        (old) =>
          old.owner !== p.id &&
          (old.path === path ||
            old.path.startsWith(path + ".") ||
            path.startsWith(old.path + ".")),
      );
      if (conflict)
        throw new Error(
          "参数 " + p.name + " 与 " + conflict.owner + " 重复写入字段 " + path,
        );
      paths.push({ path, owner: p.id });
    }
  }
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("存在循环依赖：" + id);
    if (done.has(id)) return;
    const p = parameters.find((p) => p.id === id);
    if (!p) throw new Error("依赖参数不存在：" + id);
    visiting.add(id);
    for (const ref of p.when ? refs(p.when) : []) visit(ref);
    visiting.delete(id);
    done.add(id);
  }
  parameters.forEach((p) => visit(p.id));
  function checkReferences(c: Condition) {
    if ("all" in c) {
      c.all.forEach(checkReferences);
      return;
    }
    if ("any" in c) {
      c.any.forEach(checkReferences);
      return;
    }
    const target = parameters.find((p) => p.id === c.param)!;
    if (
      ["gt", "gte", "lt", "lte"].includes(c.op ?? "") &&
      target.type !== "number"
    )
      throw new Error("数值比较只能引用 number 参数：" + c.param);
    if (target.type === "choice")
      for (const v of c.op === "in"
        ? c.values!
        : c.value !== undefined
          ? [c.value]
          : [])
        if (!target.options.some((o) => o.id === v))
          throw new Error("依赖引用的选项不存在：" + c.param + " / " + v);
  }
  parameters.forEach((p) => {
    if (p.when) checkReferences(p.when);
  });
  return parameters;
}
function matches(c: Condition, state: ParameterState): boolean {
  if ("all" in c) return c.all.every((v) => matches(v, state));
  if ("any" in c) return c.any.some((v) => matches(v, state));
  const s = state[c.param];
  if ("enabled" in c && s.enabled !== c.enabled) return false;
  if (c.op === "in") return c.values!.includes(s.value);
  if (!("value" in c)) return true;
  switch (c.op ?? "eq") {
    case "eq":
      return s.value === c.value;
    case "ne":
      return s.value !== c.value;
    case "gt":
      return Number(s.value) > Number(c.value);
    case "gte":
      return Number(s.value) >= Number(c.value);
    case "lt":
      return Number(s.value) < Number(c.value);
    case "lte":
      return Number(s.value) <= Number(c.value);
  }
}
export function effectiveParameters(
  parameters: Parameter[],
  saved: ParameterState = {},
) {
  const state: ParameterState = {},
    adjustable: Record<string, boolean> = {};
  function evaluate(p: Parameter) {
    if (state[p.id]) return;
    for (const id of p.when ? refs(p.when) : [])
      evaluate(parameters.find((p) => p.id === id)!);
    const initial = { enabled: p.toggle ? p.enabled : true, value: p.default };
    const previous = saved[p.id];
    const current =
      previous && validValue(p, previous.value)
        ? { ...previous, enabled: p.toggle ? previous.enabled : true }
        : initial;
    const active = !p.when || matches(p.when, state);
    adjustable[p.id] = active;
    state[p.id] = active
      ? current
      : {
          enabled: p.inactive?.enabled ?? p.inactive?.value !== undefined,
          value: p.inactive?.value ?? p.default,
        };
  }
  parameters.forEach(evaluate);
  return { state, adjustable };
}
// Disabled dependencies forget their previous selection; reactivation starts at defaults.
export function updateParameter(
  parameters: Parameter[],
  saved: ParameterState,
  id: string,
  patch: Partial<ParameterState[string]>,
) {
  const before = effectiveParameters(parameters, saved);
  const next = { ...saved, [id]: { ...before.state[id], ...patch } };
  const after = effectiveParameters(parameters, next);
  for (const p of parameters) {
    if (!after.adjustable[p.id] || !before.adjustable[p.id]) delete next[p.id];
  }
  return next;
}
export function parameterRequest(text: string, saved: ParameterState = {}) {
  const parameters = parseParameters(text),
    { state, adjustable } = effectiveParameters(parameters, saved);
  const body: JsonObject = {},
    summary: { name: string; value: string }[] = [];
  function replace(v: unknown, value: string | number): any {
    if (v === "VALUE") return value;
    if (Array.isArray(v)) return v.map((child) => replace(child, value));
    if (isObject(v))
      return Object.fromEntries(
        Object.entries(v).map(([k, child]) => [k, replace(child, value)]),
      );
    return v;
  }
  for (const p of parameters) {
    const s = state[p.id];
    if (!s.enabled) continue;
    if (s.invalid) throw new Error(p.name + "：请输入范围内且符合步长的数值");
    const selected = p.options.find((o) => o.id === s.value);
    const fragment =
      p.type === "choice" ? selected!.request : replace(p.request, s.value);
    if (!Object.keys(fragment).length) continue;
    mergeJson(body, fragment);
    summary.push({
      name: p.name,
      value:
        p.type === "choice"
          ? selected!.label
          : p.type === "number"
            ? String(s.value)
            : "启用",
    });
  }
  return { body, summary, state, adjustable };
}
export function serializeParameters(parameters: Parameter[]): string {
  return parameters
    .map((p) => {
      if (p.raw) return JSON.stringify(p.request, null, 2);
      const fields = [
        "name",
        "description",
        "type",
        "toggle",
        "enabled",
        "default",
        "min",
        "max",
        "step",
        "when",
        "inactive",
      ] as const;
      const lines = [
        "@param " + p.id,
        ...fields
          .filter((k) => p[k] !== undefined)
          .map((k) => k + " = " + JSON.stringify(p[k])),
      ];
      if (p.type === "choice")
        lines.push(
          ...p.options.map(
            (o) =>
              "option " +
              o.id +
              " " +
              JSON.stringify(o.label) +
              " => " +
              JSON.stringify(o.request),
          ),
        );
      else lines.push("request = " + JSON.stringify(p.request));
      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}
export function mergeParameters(existing: string, template: string) {
  const old = parseParameters(existing),
    incoming = parseParameters(template);
  for (const p of incoming) {
    const index = old.findIndex((o) => o.id === p.id);
    if (index < 0) {
      old.push(p);
      continue;
    }
    const previous = old[index],
      merged = structuredClone(p);
    if (previous.type === p.type && p.type === "choice")
      merged.options = [
        ...previous.options.filter(
          (o) => !p.options.some((n) => n.id === o.id),
        ),
        ...p.options,
      ];
    if (previous.type === p.type && p.type === "number") {
      merged.min = Math.min(previous.min!, p.min!);
      merged.max = Math.max(previous.max!, p.max!);
    }
    old[index] = merged;
  }
  const result = serializeParameters(old);
  parseParameters(result);
  return result;
}

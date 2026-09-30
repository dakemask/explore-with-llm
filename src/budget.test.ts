import { describe, expect, it } from "vitest";
import { parseBudget } from "./budget";
const budget = (template: string) => ({
  template,
  levels: "low high",
  selected: "",
});
describe("custom parameter fragment validation", () => {
  it.each([
    [
      '{"reasoning":{"effort":"EFFORT"}}\n---\n{"reasoning":{"effort":"low"}}',
      "设置冲突",
    ],
    ['{"messages":[]}', "不能覆盖"],
    ['{"previous_response_id":"abc"}', "不能覆盖"],
    ['{"reasoning":{"summary":"concise"}}', "不能覆盖"],
    ['{"thinking":{"display":"omitted"}}', "不能覆盖"],
    ['{"__proto__":{"polluted":true}}', "不能使用"],
    ['{"nested":{"constructor":{}}}', "不能使用"],
    ['{"effort":"xEFFORT"}', "完整"],
    ["[]", "JSON 对象"],
    ['{"broken":', "有效 JSON"],
  ])("rejects malformed or protected template %s", (template, error) => {
    expect(() => parseBudget(budget(template))).toThrow(error);
  });
});

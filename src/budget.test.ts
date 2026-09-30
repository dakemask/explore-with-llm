import { describe, expect, it } from "vitest";
import {
  budgetChoices,
  budgetParameters,
  budgetPresets,
  FIXED_EFFORT,
  migrateSettings,
  parseBudget,
} from "./budget";
import type { BudgetSettings, Provider } from "./types";

const provider: Provider = {
  id: "p",
  name: "p",
  key: "",
  baseUrl: "https://example.com/v1",
  model: "custom",
  remember: false,
  protocol: "responses",
};
const budget = (template: string, levels = "low high"): BudgetSettings => ({
  template,
  levels,
  selected: "",
});
describe("budget templates", () => {
  it("merges nested fragments and substitutes typed values", () => {
    const p = {
      ...provider,
      budget: budget(
        '{"thinking":{"type":"enabled"}}\n---\n{"thinking":{"budget_tokens":"EFFORT"}}',
        "1024 4096",
      ),
    };
    expect(budgetParameters(p, "4096")).toEqual({
      thinking: { type: "enabled", budget_tokens: 4096 },
    });
    expect(budgetParameters(p, "")).toEqual({});
  });
  it("allows fixed templates, empty configuration and retained level drafts", () => {
    const b = budget('{"thinking":{"type":"disabled"}}', "");
    expect(budgetChoices(b)).toEqual([FIXED_EFFORT]);
    expect(budgetParameters({ ...provider, budget: b }, FIXED_EFFORT)).toEqual({
      thinking: { type: "disabled" },
    });
    expect(budgetChoices(budget("", "low high"))).toEqual([]);
    expect(() =>
      parseBudget(budget('{"reasoning":{"effort":"EFFORT"}}', "")),
    ).toThrow("至少一个档位");
  });
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
  it("never applies a deleted level", () => {
    expect(() =>
      budgetParameters(
        { ...provider, budget: budget('{"reasoning":{"effort":"EFFORT"}}') },
        "max",
      ),
    ).toThrow("已不存在");
  });
  it("migrates legacy settings without overwriting user budget or capabilities", () => {
    const legacy = { ...provider, protocol: undefined };
    const settings = migrateSettings({
      id: "settings",
      providers: [legacy],
      selected: "p",
      thinking: true,
    });
    expect(settings.providers[0]).toMatchObject({
      protocol: "chat-completions",
      supportsEncryptedReasoning: false,
      budget: { levels: "none low high max", selected: "high" },
    });
    expect(migrateSettings(settings)).toEqual(settings);
    const custom = {
      ...provider,
      supportsEncryptedReasoning: true,
      budget: budget("", "custom"),
    };
    expect(
      migrateSettings({ ...settings, providers: [custom] }).providers[0],
    ).toEqual(custom);
  });
  it("every preset can produce a budget and the OpenAI protocols use distinct fields", () => {
    for (const protocol of [
      "chat-completions",
      "responses",
      "anthropic",
    ] as const) {
      for (const preset of budgetPresets(protocol)) {
        const b = { ...preset, selected: "" };
        expect(() =>
          budgetParameters(
            { ...provider, protocol, budget: b },
            budgetChoices(b)[0],
          ),
        ).not.toThrow();
      }
    }
    expect(budgetPresets("responses")[0].template).toContain('"reasoning"');
    expect(budgetPresets("chat-completions")[0].template).toContain(
      '"reasoning_effort"',
    );
  });
});

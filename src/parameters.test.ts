import { describe, it, expect } from "vitest";
import {
  parseParameters,
  parameterRequest,
  effectiveParameters,
  updateParameter,
  mergeParameters,
} from "./parameters";
import { parameterExample, parameterPresets } from "./parameterPresets";
import { requestBody } from "./api";
import { blankProvider, reconcileState, resolveModel } from "./config";
import { modelsEndpoint, fetchModels } from "./modelCatalog";
import { vi } from "vitest";
const mode = `@param mode
name = "模式"
type = choice
default = off
option off "关" => {}
option on "开" => {"thinking":{"type":"adaptive"}}`;
const dependent = `@param effort
name = "档位"
type = choice
default = low
when = {"param":"mode","value":"on"}
inactive = {"value":"unspecified"}
option unspecified "不指定" => {}
option low "低" => {"output_config":{"effort":"low"}}
option high "高" => {"output_config":{"effort":"high"}}`;
const together = mode + "\n---\n" + dependent;
describe("通用参数格式", () => {
  it("示例和全部逐型号预设均可解析，默认不发送", () => {
    expect(parseParameters(parameterExample)).toHaveLength(4);
    for (const protocol of [
      "responses",
      "anthropic",
      "chat-completions",
    ] as const)
      for (const preset of parameterPresets(protocol)) {
        expect(() => parseParameters(preset.text), preset.name).not.toThrow();
        expect(parameterRequest(preset.text).body).toEqual({});
        const limit = parseParameters(preset.text).find(
          (p) => p.id === "output_limit",
        )!;
        expect(limit.default).toBe(limit.max);
      }
  });
  it("档位、数值、固定配置和纯 JSON 合并，数字保留类型", () => {
    const result = parameterRequest(parameterExample, {
      thinking: { enabled: true, value: "on" },
      effort: { enabled: true, value: "high" },
      output_limit: { enabled: true, value: 5000 },
      fixed_setting: { enabled: true, value: "fixed" },
    });
    expect(result.body).toEqual({
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      max_tokens: 5000,
      temperature: 0.5,
    });
    expect(result.summary).toHaveLength(4);
    expect(parameterRequest('{"temperature":0.7}').body).toEqual({
      temperature: 0.7,
    });
  });
  it("开关关闭不发送，不产生关闭配置", () => {
    expect(
      parameterRequest(parameterExample, {
        output_limit: { enabled: false, value: 5000 },
      }).body,
    ).toEqual({});
  });
  it("依赖失效忘记选择，恢复从默认开始", () => {
    const parameters = parseParameters(together);
    let state = updateParameter(parameters, {}, "mode", { value: "on" });
    state = updateParameter(parameters, state, "effort", { value: "high" });
    expect(parameterRequest(together, state).body.output_config).toEqual({
      effort: "high",
    });
    state = updateParameter(parameters, state, "mode", { value: "off" });
    expect(state.effort).toBeUndefined();
    expect(effectiveParameters(parameters, state).state.effort.value).toBe(
      "unspecified",
    );
    state = updateParameter(parameters, state, "mode", { value: "on" });
    expect(effectiveParameters(parameters, state).state.effort.value).toBe(
      "low",
    );
  });
  it("依赖可强制开启固定配置", () => {
    const text =
      mode +
      "\n---\n" +
      `@param fallback
name = "备用"
type = fixed
toggle = true
enabled = false
when = {"param":"mode","value":"on"}
inactive = {"enabled":true}
request = {"temperature":0.2}`;
    expect(parameterRequest(text).body).toEqual({ temperature: 0.2 });
    expect(
      parameterRequest(text, { mode: { enabled: true, value: "on" } }).body,
    ).toEqual({ thinking: { type: "adaptive" } });
  });
  it("支持多层 all/any 和数值、开关比较", () => {
    const text = parameterExample.replace(
      '{"param":"thinking","value":"on"}',
      '{"all":[{"param":"thinking","op":"in","values":["on"]},{"any":[{"param":"output_limit","enabled":false},{"param":"output_limit","op":"gte","value":100}]}]}',
    );
    expect(
      parameterRequest(text, { thinking: { enabled: true, value: "on" } }).body
        .output_config,
    ).toEqual({ effort: "high" });
  });
  it.each([
    together.replace('"param":"mode"', '"param":"effort"'),
    together.replace('"param":"mode"', '"param":"missing"'),
    mode + "\n---\n" + mode,
    mode + "\n---\n" + dependent.replace('name = "档位"', 'name = "模式"'),
    '{"thinking":{"type":"disabled"}}\n---\n{"thinking":{"type":"adaptive"}}',
    '{"thinking":false}\n---\n{"thinking":{"type":"adaptive"}}',
    '{"model":"x"}',
    '{"__proto__":{}}',
  ])("拒绝循环、无效引用、重复身份和字段覆盖：%s", (text) => {
    expect(() => parseParameters(text)).toThrow();
  });
  it("无效数值输入阻止发送，旧无效数值选择采用默认", () => {
    expect(() =>
      parameterRequest(parameterExample, {
        output_limit: { enabled: true, value: 100, invalid: true },
      }),
    ).toThrow("步长");
    expect(
      parameterRequest(parameterExample, {
        output_limit: { enabled: true, value: 10001 },
      }).body,
    ).toEqual({});
  });
  it("拒绝 VALUE 对象键及非数值参数的数值比较", () => {
    expect(() => parseParameters('{"VALUE":1}')).toThrow("对象键");
    expect(() =>
      parseParameters(together.replace('"value":"on"', '"op":"gt","value":1')),
    ).toThrow("number");
  });
  it("请求包含自定义参数且保留协议管理字段", () => {
    const p = {
      ...blankProvider,
      model: "test",
      protocol: "responses" as const,
      customParameters: parameterPresets("responses")[0].text,
      parameterState: {
        effort: { enabled: true, value: "high" },
        output_limit: { enabled: true, value: 128000 },
      },
    };
    const body = requestBody([], p, "");
    expect(body.reasoning).toEqual({ effort: "high", summary: "auto" });
    expect(body.max_output_tokens).toBe(128000);
    expect(body.store).toBe(false);
  });
});
describe("模板和配置状态", () => {
  it("纯 JSON 模板覆盖同字段且保留不同字段", () => {
    expect(
      parameterRequest(
        mergeParameters(
          '{"temperature":0.2,"top_p":0.9}',
          '{"temperature":0.5}',
        ),
      ).body,
    ).toEqual({ temperature: 0.5, top_p: 0.9 });
  });
  it("档位取并集，模板覆盖同选项，保留其他参数", () => {
    const newer = mode
      .replace("default = off", "default = on")
      .replace('option off "关" => {}', 'option extra "额外" => {}');
    const merged = parseParameters(mergeParameters(together, newer));
    expect(merged).toHaveLength(2);
    expect(merged[0].options.map((o) => o.id)).toEqual(["off", "extra", "on"]);
    expect(merged[0].default).toBe("on");
  });
  it("数值范围取并集，步长和默认采用模板", () => {
    const old = parameterExample.split("\n---\n")[2],
      newer = old
        .replace("min = 1", "min = 2")
        .replace("max = 10000", "max = 20000")
        .replace("default = 10000", "default = 20000")
        .replace("step = 1", "step = 2");
    // Union changes the step origin; an invalid resulting default must be rejected.
    expect(() => mergeParameters(old, newer)).toThrow("默认");
    const valid = newer.replace("step = 2", "step = 1");
    const merged = parseParameters(mergeParameters(old, valid))[0];
    expect([merged.min, merged.max, merged.default]).toEqual([1, 20000, 20000]);
  });
  it("字段冲突导致模板合并失败", () => {
    expect(() =>
      mergeParameters(mode, '{"thinking":{"type":"disabled"}}'),
    ).toThrow("重复");
  });
  it("协议改变清空会话选择，模型删除解析失效", () => {
    const old = {
      ...blankProvider,
      protocol: "responses" as const,
      customParameters: parameterExample,
    };
    expect(
      reconcileState(
        old,
        { ...old, protocol: "anthropic" },
        { thinking: { enabled: true, value: "on" } },
      ),
    ).toEqual({});
    expect(
      resolveModel({ id: "settings", providers: [], selected: "gone" }),
    ).toBeUndefined();
  });
});
describe("模型目录", () => {
  it("路径保留 API 根地址", () => {
    expect(
      modelsEndpoint({
        ...blankProvider,
        baseUrl: "https://x.test/v1",
        protocol: "responses",
      }).href,
    ).toBe("https://x.test/v1/models");
    expect(
      modelsEndpoint({
        ...blankProvider,
        baseUrl: "https://x.test",
        protocol: "anthropic",
      }).href,
    ).toBe("https://x.test/v1/models");
  });
  it("Claude 获取全部分页、去重，并使用原生鉴权", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "a" }, { id: "a" }],
            has_more: true,
            last_id: "a",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "b" }], has_more: false })),
      );
    vi.stubGlobal("fetch", mock);
    try {
      expect(
        await fetchModels(
          {
            ...blankProvider,
            baseUrl: "https://x.test",
            key: "test",
            protocol: "anthropic",
          },
          new AbortController().signal,
        ),
      ).toEqual(["a", "b"]);
      expect(String(mock.mock.calls[1][0])).toContain("after_id=a");
      expect(mock.mock.calls[0][1].headers["x-api-key"]).toBe("test");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

import type { Protocol } from "./types";
const join = (parts: string[]) => parts.join("\n\n---\n\n");
const choice = (
  id: string,
  name: string,
  options: { id: string; request: unknown; label?: string }[],
  extra = "",
) =>
  `@param ${id}\nname = "${name}"\ntype = choice\ntoggle = true\nenabled = false\ndefault = unspecified\n${extra}\n` +
  [{ id: "unspecified", label: "不指定", request: {} }, ...options]
    .map(
      (o) =>
        `option ${o.id} "${o.label ?? o.id}" => ${JSON.stringify(o.request)}`,
    )
    .join("\n");
const output = (
  field: string,
  max: number,
  required = false,
) => `@param output_limit
name = "单次输出最大长度"
type = number
${required ? "" : "toggle = true\nenabled = false\n"}min = 1
max = ${max}
step = 1
default = ${max}
request = ${JSON.stringify({ [field]: "VALUE" })}`;
export function parameterPresets(protocol: Protocol) {
  const openai = [
    "GPT-5.6",
    "GPT-5.6 Sol",
    "GPT-5.6 Terra",
    "GPT-5.6 Luna",
    "GPT-6 Astra",
    "GPT-6 Sol",
    "GPT-6 Luna",
  ].map((name) => {
    const levels = (
      name === "GPT-6 Astra"
        ? "low medium high xhigh max"
        : "none low medium high xhigh max"
    ).split(" ");
    return {
      name,
      compatible: protocol !== "anthropic",
      text: join([
        choice(
          "effort",
          "思考档位",
          levels.map((id) => ({
            id,
            request:
              protocol === "responses"
                ? { reasoning: { effort: id } }
                : { reasoning_effort: id },
          })),
        ),
        output(
          protocol === "responses"
            ? "max_output_tokens"
            : "max_completion_tokens",
          128000,
        ),
      ]),
    };
  });
  const claude = [
    "Claude Opus 4.6",
    "Claude Sonnet 4.6",
    "Claude Opus 4.7",
    "Claude Opus 4.8",
    "Claude Opus 5",
    "Claude Opus 5.5",
    "Claude Sonnet 5",
    "Claude Sonnet 5.5",
    "Claude Fable 5",
    "Claude Fable 5.1",
    "Claude Mythos Preview",
    "Claude Mythos 5",
    "Claude Mythos 5.1",
  ].map((name) => {
    const always = /Fable|Mythos|Opus 5.5/.test(name);
    const levels = (
      /4.6|Preview/.test(name)
        ? "low medium high max"
        : "low medium high xhigh max"
    ).split(" ");
    const parts = [];
    if (!always)
      parts.push(
        choice("thinking", "思考模式", [
          {
            id: "off",
            label: name === "Claude Sonnet 5.5" ? "关闭前置思考" : "关闭思考",
            request: {
              thinking: {
                type:
                  name === "Claude Sonnet 5.5" ? "between_tools" : "disabled",
              },
            },
          },
          {
            id: "on",
            label: "开启思考",
            request: { thinking: { type: "adaptive" } },
          },
        ]),
      );
    parts.push(
      choice(
        "effort",
        "思考档位",
        levels.map((id) => ({
          id,
          request: {
            ...(always ? { thinking: { type: "adaptive" } } : {}),
            output_config: { effort: id },
          },
        })),
        always
          ? ""
          : 'when = {"param":"thinking","enabled":true,"value":"on"}\ninactive = {"enabled":false,"value":"unspecified"}',
      ),
    );
    parts.push(output("max_tokens", 128000, true));
    return { name, compatible: protocol === "anthropic", text: join(parts) };
  });
  const deepseek = ["DeepSeek V4.1 Flash", "DeepSeek V4 Pro"].map((name) => ({
    name,
    compatible: protocol !== "responses",
    text: join(
      protocol === "anthropic"
        ? [
            choice("thinking", "思考模式", [
              {
                id: "off",
                label: "关闭思考",
                request: { thinking: { type: "disabled" } },
              },
              {
                id: "on",
                label: "开启思考",
                request: { thinking: { type: "enabled", budget_tokens: 1024 } },
              },
            ]),
            choice(
              "effort",
              "思考档位",
              ["low", "high", "max"].map((id) => ({
                id,
                request: { output_config: { effort: id } },
              })),
              'when = {"param":"thinking","enabled":true,"value":"on"}\ninactive = {"enabled":false,"value":"unspecified"}',
            ),
            output("max_tokens", 393216, true),
          ]
        : [
            choice(
              "effort",
              "思考档位",
              ["none", "low", "high", "max"].map((id) => ({
                id,
                label: id === "none" ? "关闭思考" : id,
                request: { reasoning_effort: id },
              })),
            ),
            output("max_tokens", 393216),
          ],
    ),
  }));
  return [...openai, ...claude, ...deepseek];
}
export const parameterExample = `@param thinking
name = "思考模式"
type = choice
toggle = true
enabled = false
default = unspecified
option unspecified "不指定" => {}
option off "关闭思考" => {"thinking":{"type":"disabled"}}
option on "开启思考" => {"thinking":{"type":"adaptive"}}

---

@param effort
name = "思考档位"
type = choice
toggle = true
enabled = true
default = high
when = {"param":"thinking","value":"on"}
inactive = {"value":"unspecified"}
option unspecified "不指定" => {}
option low "低" => {"output_config":{"effort":"low"}}
option high "高" => {"output_config":{"effort":"high"}}

---

@param output_limit
name = "单次输出最大长度"
type = number
min = 1
max = 10000
step = 1
default = 10000
request = {"max_tokens":"VALUE"}

---

@param fixed_setting
name = "固定配置"
type = fixed
toggle = true
enabled = false
request = {"temperature":0.5}`;

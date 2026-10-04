import type { Lang } from '../i18n'

/** An example config, used in the format doc. */
const exampleZh = `[
  {
    "name": "思考",
    "type": "fixed",
    "body": { "thinking": { "type": "enabled" } },
    "toggle": true,
    "defaultOn": true
  },
  {
    "name": "思考强度",
    "type": "choice",
    "body": { "reasoning_effort": "EFFORT" },
    "options": ["low", "medium", "high"],
    "default": "medium",
    "requires": { "思考": true }
  },
  {
    "name": "最大输出",
    "type": "range",
    "body": { "max_tokens": "VALUE" },
    "min": 1000,
    "max": 64000,
    "step": 1000,
    "default": 8000,
    "toggle": true,
    "defaultOn": false
  },
  {
    "type": "silent",
    "body": { "stream_options": { "include_usage": true } }
  }
]`

const exampleEn = exampleZh
  .replace('"思考强度"', '"Effort"')
  .replace(/"思考"/g, '"Thinking"')
  .replace('"最大输出"', '"Max output"')

const zh = `# 模型参数配置格式

每个模型可以有一份参数配置，决定请求里**额外发送哪些字段**，以及在输入框旁边**提供哪些可调选项**。应用不理解任何参数的含义，只按配置显示控件，并把启用的参数合并进请求体。

配置是一个 JSON 数组，每一项描述一个参数。必须是严格的 JSON：不能有注释，不能有多余的逗号。

## 四种类型

| type | 名称 | 说明 |
|---|---|---|
| \`choice\` | 档位型 | 在几个离散值中选一个。\`body\` 里用字符串 \`"EFFORT"\` 占位，发送时替换为选中的值 |
| \`range\` | 数字范围型 | 在上下限之间按步长取值。\`body\` 里用字符串 \`"VALUE"\` 占位，发送时替换为数字 |
| \`fixed\` | 固定参数型 | 内容固定。没有开关时，只在界面上展示 |
| \`silent\` | 静默发送型 | 每次请求都原样发送，界面上不显示，只需要 \`body\` |

## 字段

| 字段 | 适用 | 必填 | 说明 |
|---|---|---|---|
| \`type\` | 全部 | 是 | 上面四种之一 |
| \`body\` | 全部 | 是 | 要合并进请求体的 JSON 对象，占位符可以在任意嵌套层级 |
| \`name\` | 前三种 | 是 | 显示给用户的名字，在同一份配置里不能重复 |
| \`options\` | choice | 是 | 可选值的数组（字符串、数字或布尔） |
| \`min\` / \`max\` | range | 是 | 下限和上限 |
| \`step\` | range | 否 | 步长，默认 1，可以是小数 |
| \`default\` | choice / range | 否 | 默认值；省略时取第一个选项 / 下限 |
| \`toggle\` | 前三种 | 否 | \`true\` 表示带开关（可选参数）；默认 \`false\`，有 \`requires\` 时总是带开关 |
| \`defaultOn\` | 前三种 | 否 | 可开关时默认是否打开；默认 \`true\` |
| \`requires\` | 前三种 | 否 | 依赖，见下文 |

## 依赖

\`requires\` 是一个对象，键是另一个参数的 \`name\`，值是条件，所有条件都满足时这个参数才可用：

- \`true\`：那个参数处于启用状态（打开且自身可用）
- \`false\`：那个参数没有启用
- 一个值或值的数组：那个参数启用，并且当前取值是其中之一（不能用于 fixed）

依赖可以连锁，但不能循环。

## 开关的含义

- 有开关：这个参数是可选的。带依赖的参数一定有开关。
- 开关可操作：目前没有依赖限制它。
- 开关变灰：依赖不满足，这个参数不能发送，开关显示为关闭。依赖重新满足后，开关回到用户之前的位置。
- 开关打开：发送这个参数，并显示它的档位、数值或固定内容。
- 开关关闭：不发送，也不显示它的档位、数值或固定内容。
- 没有开关：每次都发送。

## 合并规则

- 按配置顺序合并。多个参数写进同一个对象时逐层合并，同一个键后面的覆盖前面的。
- 协议自己设置的字段不能使用：OpenAI Chat Completions 和 Anthropic Messages 的 \`model\`、\`messages\`、\`stream\`；OpenAI Responses 的 \`model\`、\`input\`、\`stream\`。
- Anthropic Messages 协议要求每个请求都带 \`max_tokens\`，配置里必须提供它（例如数字范围型或静默发送型），否则不能发送。
- 应用自己不会添加任何参数。比如想在流式回复中拿到 token 用量，需要自己加上对应字段（见下面示例的最后一项）。

## 示例

\`\`\`json
${exampleZh}
\`\`\`

## 让大模型帮你写

把这份说明和供应商 API 文档中关于请求参数的部分一起发给大模型，告诉它要为哪个模型生成配置、想调哪些参数，并要求它只输出 JSON 数组。然后把结果粘贴到设置里。
`

const en = `# Model parameter config format

Each model can have a parameter config. It decides which **extra fields** the request carries and which **adjustable options** appear next to the input box. The app doesn't know what any parameter means: it only shows controls from the config and merges the active parameters into the request body.

The config is a JSON array; each item describes one parameter. It must be strict JSON: no comments, no trailing commas.

## Four types

| type | Kind | Meaning |
|---|---|---|
| \`choice\` | Levels | Pick one of a few discrete values. Use the string \`"EFFORT"\` as a placeholder in \`body\`; it is replaced by the chosen value |
| \`range\` | Number range | A number between min and max in steps. Use the string \`"VALUE"\` as a placeholder in \`body\`; it is replaced by the number |
| \`fixed\` | Fixed | Fixed content. Without a toggle it is only displayed |
| \`silent\` | Silent | Sent as-is with every request, never shown; only needs \`body\` |

## Fields

| Field | Applies to | Required | Meaning |
|---|---|---|---|
| \`type\` | all | yes | One of the four above |
| \`body\` | all | yes | JSON object merged into the request body; placeholders may sit at any depth |
| \`name\` | first three | yes | Name shown to the user; unique within the config |
| \`options\` | choice | yes | Array of values (strings, numbers or booleans) |
| \`min\` / \`max\` | range | yes | Lower and upper bound |
| \`step\` | range | no | Step, default 1, may be fractional |
| \`default\` | choice / range | no | Default value; first option / min when omitted |
| \`toggle\` | first three | no | \`true\` gives it a switch (an optional parameter). Default \`false\`; always \`true\` when it has \`requires\` |
| \`defaultOn\` | first three | no | Whether a switchable parameter starts on. Default \`true\` |
| \`requires\` | first three | no | Dependencies, see below |

## Dependencies

\`requires\` is an object whose keys are other parameters' \`name\`s and whose values are conditions. The parameter is available only when all of them hold:

- \`true\`: that parameter is active (on, and itself available)
- \`false\`: that parameter is not active
- a value or an array of values: that parameter is active and its value is one of them (not for fixed)

Dependencies may chain but not loop.

## What the switch means

- A switch: the parameter is optional. A parameter with dependencies always has one.
- Switch usable: no dependency restricts it right now.
- Switch greyed out: a dependency isn't met, so it can't be sent; the switch shows off. Once the dependency holds again, the switch returns to where the user left it.
- Switch on: sent, and its level, number or fixed content is shown.
- Switch off: not sent, and its level, number or fixed content is hidden.
- No switch: always sent.

## Merging

- Items merge in config order. Parameters writing into the same object merge level by level; for the same key the later one wins.
- Fields the protocol sets itself are off limits: \`model\`, \`messages\`, \`stream\` for OpenAI Chat Completions and Anthropic Messages; \`model\`, \`input\`, \`stream\` for OpenAI Responses.
- Anthropic Messages requires \`max_tokens\` in every request, so the config must supply it (e.g. as a range or silent parameter); sending is blocked otherwise.
- The app adds no parameters of its own. For example, to get token usage in streamed replies, add the field yourself (see the last item of the example).

## Example

\`\`\`json
${exampleEn}
\`\`\`

## Let a model write it

Give this document to an LLM together with the request-parameter part of your provider's API docs. Tell it which model the config is for and what you want to adjust, and ask for the JSON array only. Paste the result into Settings.
`

export function paramsDoc(lang: Lang) {
  return lang === 'zh' ? zh : en
}

export function paramsExample(lang: Lang) {
  return lang === 'zh' ? exampleZh : exampleEn
}

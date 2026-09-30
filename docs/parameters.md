# 自定义参数格式

在模型编辑或供应商模板的单个输入框内填写参数。每段用独立一行 `---` 分隔，以 `@param 参数ID` 开始。ID 使用英文字母开头的字母、数字、下划线或连字符；ID 与界面名称分别要求唯一。以 `#` 开头的行是注释，不支持行尾注释。不需要版本号。

声明采用 `键 = 值`。字符串可用 JSON 双引号；type、default 的简单选项 ID 可不加引号。布尔值是 true/false，数值直接写数字，对象和数组使用 JSON。请求对象可跨行。

## 公共声明

| 声明        | 含义                                                          |
| ----------- | ------------------------------------------------------------- |
| name        | 界面名称，省略时采用参数 ID                                   |
| description | 可选说明，悬停名称时显示                                      |
| type        | choice（档位）、number（数值）、fixed（固定），省略时是 fixed |
| toggle      | 是否提供启用开关，默认 false                                  |
| enabled     | 开关默认状态，默认 true；没有开关时必须为 true                |
| default     | choice 的选项 ID，number 的数字；fixed 不需要填写             |
| when        | 可选依赖条件，JSON 对象                                       |
| inactive    | 依赖不满足时的强制状态，JSON 对象                             |
| request     | number/fixed 对应的 JSON 请求片段                             |

开关关闭时不发送任何片段。需要发送关闭配置时，将关闭 JSON 写成一个固定参数或档位选项。无开关参数始终按选值发送；选项片段为空对象时不发送。

预设按模型与请求协议的必填要求设置开关：必填参数不提供开关，始终发送；允许省略的参数提供开关，关闭时不发送。Anthropic Messages 的 `max_tokens` 按必填参数配置（包括 Claude 和 DeepSeek 的 Anthropic 兼容预设）；OpenAI 与 DeepSeek Chat Completions 的输出长度保留可选开关。可选思考模式与档位也提供开关。关闭开关后，具体选项或数值输入化成粒子消失，随后下方参数平滑上移补位；再次开启时淡入显示。

应用不会补充默认输出长度，也不会采用旧版思考配置。已有模型中保存的模板不会自动改写，需要重新应用相应预设。

## 档位参数

```text
@param thinking
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
```

每个 option 的稳定 ID 独立于显示名称。不同选项可以使用完全不同的请求对象，并可写入同一字段。choice 不使用公共 request，所有请求写在选项中。

## 数值与固定配置

```text
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
request = {"temperature":0.5}
```

number 必须提供有限数值 min/max/step/default，step 大于零；默认值与选择值必须在范围内，且从 min 开始符合步长。支持小数。完整 JSON 字符串 `"VALUE"` 会被替换为数字，不能作为对象键或嵌入其他文字中。VALUE 只用于 number 参数。

也可以直接粘贴纯 JSON 对象作为一段。这种配置始终发送，不产生可调节控件；模板合并时按固定字段保留或覆盖：

```json
{ "temperature": 0.5, "top_p": 0.9 }
```

## 依赖条件与强制状态

when 中使用有效状态参与比较，条件支持嵌套：

```json
{
  "all": [
    { "param": "thinking", "value": "on" },
    {
      "any": [
        { "param": "output_limit", "enabled": false },
        { "param": "output_limit", "op": "gte", "value": 1000 }
      ]
    }
  ]
}
```

- `enabled` 比较是否发送，可以单独使用，也可以与选值比较同时使用。
- `value` 比较选项 ID 或数值。op 默认 eq（等于），可用 ne（不等于）。
- `op="in"` 使用 values 数组，表示值属于该集合。
- gt/gte/lt/lte 分别是大于、大于等于、小于、小于等于，只能引用 number 参数。
- all 要求全部满足，any 要求任一满足。数组不能为空。

依赖必须引用已存在的参数和有效档位；禁止自身依赖和循环依赖。应用按依赖顺序计算有效状态，不运行任意脚本。

inactive 可以声明 `{"enabled":false}`、`{"value":"某选项"}` 或 `{"enabled":true,"value":1000}`。仅声明 value 时会发送该值；enabled 为 false 时不发送。省略 value 则显示默认值。省略整个 inactive 时不发送，但显示默认值。依赖不满足时控件置灰，用户此前的选择丢弃；依赖恢复后采用默认状态。

互斥模式优先用一个 choice 的不同选项表达，其他参数依赖它。这样不需要两个开关互相更改。

## 字段校验、保存和模板

不同参数不能写入同一请求字段，也不能一个写父字段、另一个写其子字段；此规则对所有选项生效，即使选项互斥。同一个参数的不同选项不受此限制。

模型、消息历史、流式控制、服务端会话引用、工具控制和加密思维链管理字段由应用控制，不能覆盖。例如 model/messages/input/stream/store/include/previous_response_id/conversation，以及 reasoning.summary/thinking.display 都受保护。禁止原型污染字段。

供应商模板按参数 ID 合并。模板覆盖相同 ID 的名称、说明、默认值、开关、依赖和请求配置；choice 合并选项 ID，number 合并区间并使用模板步长；类型不同则整体替换。所有模型通过合并后的校验才应用。如果区间合并使默认值不符合新步长，会报错而不是悄悄改变值。

配置改变后，会话中仍有效的选择保留；选项消失、数值无效或类型改变时回到默认。协议切换会清空相关选择。每次发送保存实际生效的自定义参数快照。

如果不知道如何填写，可以将本说明与模型提供方的文档一并发送给AI，让其输出可以直接复制后填入输入框的内容。

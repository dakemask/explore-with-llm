import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { Modal } from "./Modal";
import type { ModelConfig, ModelTemplate, Provider } from "./types";
import { parseParameters } from "./parameters";
import { parameterExample, parameterPresets } from "./parameterPresets";
import SelectMenu from "./SelectMenu";
export const emptyTemplate = (): ModelTemplate => ({
  customParameters: "",
  chatgpt: "keep",
  claude: "keep",
});
export default function ModelConfigDialog({
  provider,
  model,
  onClose,
  onSave,
  onApply,
}: {
  provider: Provider;
  model?: ModelConfig;
  onClose: () => void;
  onSave: (value: ModelConfig | ModelTemplate) => void;
  onApply?: (value: ModelTemplate) => void;
}) {
  const [value, setValue] = useState(
      model
        ? structuredClone(model)
        : structuredClone(provider.template ?? emptyTemplate()),
    ),
    [error, setError] = useState(""),
    [help, setHelp] = useState<"parameters" | "reasoning" | null>(null);
  const template = !model,
    protocol = provider.protocol ?? "chat-completions";
  const patch = (v: object) => setValue((old) => ({ ...old, ...v }));
  function save(apply = false) {
    try {
      parseParameters(value.customParameters);
      if (
        !template &&
        (!(value as ModelConfig).model.trim() ||
          provider.models?.some(
            (m) =>
              m.id !== model?.id &&
              m.model === (value as ModelConfig).model.trim(),
          ))
      )
        throw new Error("请填写唯一的模型 ID");
      if (apply) onApply?.(value as ModelTemplate);
      else
        onSave(
          template
            ? value
            : { ...value, model: (value as ModelConfig).model.trim() },
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={
        template ? "供应商模板" : model?.model ? "编辑模型" : "手动添加模型"
      }
      onClose={onClose}
    >
      <div className="model-config-fields">
        {!template && (
          <label>
            模型 ID
            <input
              value={(value as ModelConfig).model}
              onChange={(e) => patch({ model: e.target.value })}
            />
          </label>
        )}
        <div className="capability-row">
          {(["chatgpt", "claude"] as const).map((source) => {
            const supported =
                source === "chatgpt"
                  ? protocol === "responses"
                  : protocol === "anthropic",
              name = source === "chatgpt" ? "ChatGPT" : "Claude";
            return (
              <div
                key={source}
                title={
                  supported
                    ? ""
                    : name +
                      "思维链当前仅支持" +
                      (source === "chatgpt"
                        ? "OpenAI Responses"
                        : "Anthropic Messages") +
                      "协议"
                }
              >
                {template ? (
                  <>
                    <span>{name}原生思维链</span>
                    <SelectMenu
                      label={name + "支持声明"}
                      disabled={!supported}
                      value={(value as ModelTemplate)[source]}
                      options={[
                        { value: "keep", label: "不覆盖" },
                        { value: "yes", label: "支持", disabled: !supported },
                        { value: "no", label: "不支持", disabled: !supported },
                      ]}
                      onChange={(v) => patch({ [source]: v })}
                    />
                  </>
                ) : (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      disabled={!supported}
                      checked={
                        supported &&
                        (value as ModelConfig).supportsEncryptedReasoning
                      }
                      onChange={(e) =>
                        patch({ supportsEncryptedReasoning: e.target.checked })
                      }
                    />
                    可用{name}加密思维链
                  </label>
                )}
              </div>
            );
          })}
          <button
            className="icon"
            aria-label="原生思维链说明"
            onClick={() => setHelp("reasoning")}
          >
            <CircleHelp size={18} />
          </button>
        </div>
        <div className="parameter-heading">
          <strong>自定义参数</strong>
          <button
            className="icon"
            aria-label="自定义参数说明"
            onClick={() => setHelp("parameters")}
          >
            <CircleHelp size={18} />
          </button>
        </div>
        <textarea
          className="parameter-source"
          aria-label="自定义参数"
          value={value.customParameters}
          spellCheck={false}
          placeholder="粘贴参数配置，使用 --- 分隔不同参数"
          onChange={(e) => patch({ customParameters: e.target.value })}
        />
        <SelectMenu
          label="使用预设参数覆盖"
          value=""
          up
          options={[
            ...(!template && provider.template
              ? [{ value: "template", label: "当前供应商模板" }]
              : []),
            ...parameterPresets(protocol).map((p, i) => ({
              value: String(i),
              label: p.name,
              disabled: !p.compatible,
              reason: p.compatible ? undefined : "此预设不支持当前协议",
            })),
          ]}
          onChange={(v) => {
            if (v === "template") {
              const declaration =
                protocol === "responses"
                  ? provider.template?.chatgpt
                  : protocol === "anthropic"
                    ? provider.template?.claude
                    : "keep";
              patch({
                customParameters: provider.template?.customParameters ?? "",
                ...(declaration !== "keep"
                  ? { supportsEncryptedReasoning: declaration === "yes" }
                  : {}),
              });
            } else
              patch({
                customParameters: parameterPresets(protocol)[Number(v)].text,
              });
            setError("");
          }}
        />
        {template && (
          <div className="template-apply">
            <button className="secondary" onClick={() => save(true)}>
              保存并应用到所有模型
            </button>
            <span
              tabIndex={0}
              aria-label="模板合并说明"
              title="按参数 ID 合并；模板覆盖相同键，保留不同键。档位选项取并集，数值范围覆盖双方，步长采用模板值。全部模型校验通过才应用。"
            >
              <CircleHelp size={18} />
            </span>
          </div>
        )}
        {error && <p className="inline-error">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button className="secondary" onClick={onClose}>
          取消
        </button>
        <button className="primary" onClick={() => save()}>
          保存
        </button>
      </footer>
      {help && (
        <Modal
          title={help === "parameters" ? "自定义参数说明" : "原生思维链说明"}
          onClose={() => setHelp(null)}
        >
          {help === "reasoning" ? (
            <p>
              能力由你声明，应用不检查模型是否支持。ChatGPT 加密思维链仅支持
              OpenAI Responses，Claude 加密思维链仅支持 Anthropic
              Messages。返回内容始终保存；声明支持后可以选择随历史发送。
            </p>
          ) : (
            <div className="parameter-help">
              <p>
                每段以 @param 参数ID 开始，以独立一行 --- 分隔。ID
                和名称必须唯一。type 支持
                choice、number、fixed。name/description 使用 JSON
                字符串；toggle/ enabled 使用 true 或 false。# 开头的行是注释。
              </p>
              <p>
                choice 用 option 选项ID "显示名称" =&gt; JSON
                定义各档位；default 填选项 ID，空对象表示不发送。number 必须填写
                min/max/step/default，并在 request 中用完整字符串 "VALUE"
                占位，发送时替换为数字。fixed 的 request 是固定
                JSON。toggle=true 提供开关，enabled
                是默认开关状态，关闭时不发送。
              </p>
              <p>
                when 使用 JSON 条件：{'{"param":"参数ID","enabled":true}'} 或{" "}
                {'{"param":"参数ID","value":"选项ID"}'}。op 支持
                eq/ne/in/gt/gte/lt/lte；in 使用 values 数组。
                {'{"all":[条件,条件]}'} 要求全部满足，any
                要求任一满足，可嵌套。禁止循环和无效引用。
              </p>
              <p>
                inactive 是条件不满足时的强制状态，例如{" "}
                {'{"enabled":true,"value":"high"}'}。仅指定 value
                表示发送该值，enabled=false
                表示不发送。未声明则不发送。依赖恢复后回到默认状态。不同参数不能写同一字段或父子字段；应用控制的模型、消息和流式字段不能覆盖。纯
                JSON 段作为始终发送的固定配置。
              </p>
              <p>
                如果不知道如何填写，可以将本说明与模型提供方的文档一并发送给AI，让其输出可以直接复制后填入输入框的内容。
              </p>
              <pre>{parameterExample}</pre>
              <button
                className="secondary"
                onClick={() => navigator.clipboard.writeText(parameterExample)}
              >
                复制示例
              </button>
            </div>
          )}
        </Modal>
      )}
    </Modal>
  );
}

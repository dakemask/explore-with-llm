import { useEffect, useRef, useState } from "react";
import { Download, Plus, Trash2, Settings2, FileSliders } from "lucide-react";
import { Modal } from "./Modal";
import type { Settings, Provider, ModelConfig, ModelTemplate } from "./types";
import { blankProvider, resolveModel } from "./config";
import ModelConfigDialog, { emptyTemplate } from "./ModelConfigDialog";
import SelectMenu from "./SelectMenu";
import { mergeParameters, parseParameters } from "./parameters";
import { endpoint } from "./api";
import { fetchModels, modelsEndpoint } from "./modelCatalog";
import { uid } from "./model";
export default function SettingsDialog({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(structuredClone(settings)),
    [active, setActive] = useState(settings.providers[0]?.id ?? ""),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<ModelConfig | "template" | null>(null),
    [catalog, setCatalog] = useState<string[] | null>(null),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(false),
    [undo, setUndo] = useState<{
      provider: string;
      model: ModelConfig;
      index: number;
      selected: boolean;
    } | null>(null);
  const controller = useRef<AbortController | null>(null),
    p = value.providers.find((p) => p.id === active);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    controller.current?.abort();
    setLoading(false);
    setCatalog(null);
  }, [active]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(timer);
  }, [undo]);
  function patch(patch: Partial<Provider>) {
    setValue((old) => ({
      ...old,
      providers: old.providers.map((item) =>
        item.id === active ? { ...item, ...patch } : item,
      ),
    }));
    setError("");
  }
  function add(ids: string[]) {
    if (!p) return;
    const models = [...(p.models ?? [])];
    for (const model of ids)
      if (!models.some((m) => m.model === model))
        models.push({
          id: uid(),
          model,
          customParameters: "",
          supportsEncryptedReasoning: false,
        });
    patch({ models });
  }
  async function getModels() {
    if (!p) return;
    const target = p.id,
      c = new AbortController();
    controller.current = c;
    setLoading(true);
    setError("");
    try {
      const ids = await fetchModels(
        structuredClone(p),
        AbortSignal.any([c.signal, AbortSignal.timeout(30000)]),
      );
      if (c.signal.aborted) return;
      if (ids.length <= 12)
        setValue((old) => ({
          ...old,
          providers: old.providers.map((item) =>
            item.id === target
              ? {
                  ...item,
                  models: [
                    ...(item.models ?? []),
                    ...ids
                      .filter((id) => !item.models?.some((m) => m.model === id))
                      .map((model) => ({
                        id: uid(),
                        model,
                        customParameters: "",
                        supportsEncryptedReasoning: false,
                      })),
                  ],
                }
              : item,
          ),
        }));
      else {
        setCatalog(ids);
        setSearch("");
      }
      if (!ids.length) setError("此提供商未返回可用模型");
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function applyTemplate(template: ModelTemplate) {
    if (!p) return;
    const errors: string[] = [];
    const models = p.models?.map((model) => {
      try {
        const declaration =
          p.protocol === "responses"
            ? template.chatgpt
            : p.protocol === "anthropic"
              ? template.claude
              : "keep";
        return {
          ...model,
          customParameters: mergeParameters(
            model.customParameters,
            template.customParameters,
          ),
          supportsEncryptedReasoning:
            declaration === "keep"
              ? model.supportsEncryptedReasoning
              : declaration === "yes",
        };
      } catch (e) {
        errors.push(model.model + "：" + (e as Error).message);
        return model;
      }
    });
    if (errors.length) throw new Error(errors.join("\n"));
    patch({ models, template });
    setEditor(null);
  }
  function preview(models = false) {
    try {
      return (models ? modelsEndpoint(p!) : endpoint(p!)).href;
    } catch {
      return "请填写有效的 Base URL";
    }
  }
  return (
    <Modal title="模型提供商" onClose={onClose} wide>
      <div className="settings-layout">
        <nav>
          {value.providers.map((item) => (
            <button
              className={active === item.id ? "active" : ""}
              key={item.id}
              onClick={() => {
                controller.current?.abort();
                setLoading(false);
                setActive(item.id);
                setCatalog(null);
                setError("");
              }}
            >
              {item.name || "未命名"}
            </button>
          ))}
          <button
            onClick={() => {
              const provider = {
                ...blankProvider,
                id: uid(),
                name: "新提供商",
                models: [],
              };
              setValue({ ...value, providers: [...value.providers, provider] });
              setActive(provider.id);
            }}
          >
            <Plus size={15} />
            添加提供商
          </button>
        </nav>
        {p ? (
          <div className="settings-fields">
            <label>
              名称
              <input
                value={p.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label>
              协议
              <SelectMenu
                label="协议"
                value={p.protocol ?? "chat-completions"}
                options={[
                  {
                    value: "chat-completions",
                    label: "OpenAI Chat Completions",
                  },
                  { value: "responses", label: "OpenAI Responses" },
                  { value: "anthropic", label: "Anthropic Messages" },
                ]}
                onChange={(v) => {
                  if (v === (p.protocol ?? "chat-completions")) return;
                  patch({
                    protocol: v as Provider["protocol"],
                    parameterRevision: (p.parameterRevision ?? 0) + 1,
                    models: p.models?.map((m) => ({
                      ...m,
                      supportsEncryptedReasoning: false,
                    })),
                  });
                }}
              />
            </label>
            <label>
              Base URL
              <input
                value={p.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
              />
            </label>
            <small className="request-preview">
              实际请求路径预览：{preview()}
            </small>
            <label>
              API Key
              <input
                type="password"
                autoComplete="off"
                value={p.key}
                onChange={(e) => patch({ key: e.target.value })}
                placeholder="sk-…"
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={p.remember}
                onChange={(e) => patch({ remember: e.target.checked })}
              />
              在此浏览器记住密钥
            </label>
            <div className="parameter-heading">
              <strong>模型列表</strong>
              <div className="model-list-actions">
                <button
                  className="icon"
                  aria-label="获取模型"
                  disabled={loading}
                  title={"从 " + preview(true) + " 获取可用模型"}
                  onClick={() => void getModels()}
                >
                  <Download size={18} />
                </button>
                <button
                  className="icon"
                  aria-label="手动添加模型"
                  onClick={() =>
                    setEditor({
                      id: uid(),
                      model: "",
                      customParameters: "",
                      supportsEncryptedReasoning: false,
                    })
                  }
                >
                  <Plus size={18} />
                </button>
                <button
                  className="icon"
                  aria-label="设置供应商模板"
                  onClick={() => setEditor("template")}
                >
                  <FileSliders size={18} />
                </button>
              </div>
            </div>
            {loading && <small>正在获取模型…</small>}
            <div className="provider-models">
              {p.models?.map((model, index) => (
                <div className="provider-model-row" key={model.id}>
                  <span>{model.model}</span>
                  <button
                    className="icon"
                    aria-label={"编辑模型 " + model.model}
                    onClick={() => setEditor(model)}
                  >
                    <Settings2 size={17} />
                  </button>
                  <button
                    className="icon danger"
                    aria-label={"删除模型 " + model.model}
                    onClick={() => {
                      setUndo({
                        provider: p.id,
                        model,
                        index,
                        selected: value.selected === model.id,
                      });
                      patch({
                        models: p.models?.filter((m) => m.id !== model.id),
                      });
                      if (value.selected === model.id)
                        setValue((old) => ({ ...old, selected: "" }));
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              {!p.models?.length && (
                <p className="muted">获取模型或手动添加模型</p>
              )}
            </div>
            {undo && (
              <div className="undo-model">
                已删除模型
                <button
                  onClick={() => {
                    const target = value.providers.find(
                      (p) => p.id === undo.provider,
                    );
                    if (
                      target &&
                      !target.models?.some((m) => m.model === undo.model.model)
                    ) {
                      const models = [...(target.models ?? [])];
                      models.splice(undo.index, 0, undo.model);
                      setValue({
                        ...value,
                        selected: undo.selected
                          ? undo.model.id
                          : value.selected,
                        providers: value.providers.map((p) =>
                          p.id === target.id ? { ...p, models } : p,
                        ),
                      });
                    }
                    setUndo(null);
                  }}
                >
                  撤销
                </button>
              </div>
            )}
            <button
              className="text-button danger"
              onClick={() => {
                if (
                  window.confirm(
                    "删除提供商“" + p.name + "”及其密钥、模板和全部模型配置？",
                  )
                ) {
                  const providers = value.providers.filter(
                    (item) => item.id !== p.id,
                  );
                  setValue({
                    ...value,
                    providers,
                    selected: p.models?.some((m) => m.id === value.selected)
                      ? ""
                      : value.selected,
                  });
                  setActive(providers[0]?.id ?? "");
                  setUndo(null);
                }
              }}
            >
              删除提供商配置
            </button>
          </div>
        ) : (
          <div className="settings-fields">
            <p className="muted">添加一个模型提供商开始配置</p>
          </div>
        )}
      </div>
      {error && <p className="inline-error">{error}</p>}
      <footer className="modal-footer">
        <button className="secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          onClick={() => {
            try {
              for (const p of value.providers) {
                if (!p.name.trim()) throw new Error("请填写提供商名称");
                endpoint(p);
                for (const m of p.models ?? [])
                  parseParameters(m.customParameters);
              }
              onSave({
                ...value,
                selected: resolveModel(value) ? value.selected : "",
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          保存设置
        </button>
      </footer>
      {p && editor && (
        <ModelConfigDialog
          provider={p}
          model={editor === "template" ? undefined : editor}
          onClose={() => setEditor(null)}
          onApply={applyTemplate}
          onSave={(v) => {
            if (editor === "template") patch({ template: v as ModelTemplate });
            else {
              const model = v as ModelConfig;
              patch({
                models: p.models?.some((m) => m.id === model.id)
                  ? p.models.map((m) => (m.id === model.id ? model : m))
                  : [...(p.models ?? []), model],
              });
            }
            setEditor(null);
          }}
        />
      )}
      {p && catalog && (
        <Modal title="添加可用模型" onClose={() => setCatalog(null)}>
          <input
            aria-label="搜索模型"
            placeholder="搜索模型"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="catalog-list">
            {catalog
              .filter((id) => id.toLowerCase().includes(search.toLowerCase()))
              .map((id) => (
                <button
                  disabled={p.models?.some((m) => m.model === id)}
                  key={id}
                  onClick={() => add([id])}
                >
                  {id}
                  {p.models?.some((m) => m.model === id)
                    ? " · 已添加"
                    : " · 添加"}
                </button>
              ))}
          </div>
          <footer className="modal-footer">
            <button className="secondary" onClick={() => setCatalog(null)}>
              完成
            </button>
            <button
              className="primary"
              onClick={() =>
                add(
                  catalog.filter((id) =>
                    id.toLowerCase().includes(search.toLowerCase()),
                  ),
                )
              }
            >
              添加全部搜索结果
            </button>
          </footer>
        </Modal>
      )}
    </Modal>
  );
}

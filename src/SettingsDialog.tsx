import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import type { Settings } from "./types";
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
    [active, setActive] = useState(settings.selected),
    [error, setError] = useState("");
  const p = value.providers.find((p) => p.id === active)!;
  function update(field: string, v: string | boolean) {
    setValue({
      ...value,
      providers: value.providers.map((item) =>
        item.id === active ? { ...item, [field]: v } : item,
      ),
    });
  }
  return (
    <Modal title="模型提供商" onClose={onClose}>
      <div className="settings-layout">
        <nav>
          {value.providers.map((provider) => (
            <button
              className={active === provider.id ? "active" : ""}
              key={provider.id}
              onClick={() => setActive(provider.id)}
            >
              {provider.name || "未命名"}
            </button>
          ))}
          <button
            onClick={() => {
              const id = uid();
              setValue({
                ...value,
                providers: [
                  ...value.providers,
                  {
                    id,
                    name: "新提供商",
                    baseUrl: "https://api.deepseek.com",
                    key: "",
                    model: "deepseek-flash",
                    remember: true,
                  },
                ],
              });
              setActive(id);
            }}
          >
            <Plus size={15} />
            添加提供商
          </button>
        </nav>
        <div className="settings-fields">
          <label>
            名称
            <input
              value={p.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </label>
          <label>
            Base URL
            <input
              value={p.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder="https://api.deepseek.com"
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              autoComplete="off"
              value={p.key}
              onChange={(e) => update("key", e.target.value)}
              placeholder="sk-…"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={p.remember}
              onChange={(e) => update("remember", e.target.checked)}
            />
            在此浏览器记住密钥
          </label>
          <label>
            模型 ID
            <input
              list="deepseek-models"
              value={p.model}
              onChange={(e) => update("model", e.target.value)}
            />
            <datalist id="deepseek-models">
              <option value="deepseek-flash" />
              <option value="deepseek-v4-pro" />
            </datalist>
          </label>
          <div className="settings-bottom">
            <button className="text-button" onClick={() => update("key", "")}>
              清除密钥
            </button>
            <button
              className="icon danger"
              title="删除提供商"
              disabled={value.providers.length === 1}
              onClick={() => {
                if (window.confirm(`删除提供商“${p.name}”？`)) {
                  const providers = value.providers.filter(
                    (i) => i.id !== p.id,
                  );
                  setValue({
                    ...value,
                    providers,
                    selected:
                      value.selected === p.id
                        ? providers[0].id
                        : value.selected,
                  });
                  setActive(providers[0].id);
                }
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
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
                const url = new URL(p.baseUrl);
                if (!p.name.trim() || !p.model.trim())
                  throw new Error("请填写名称和模型 ID");
                if (
                  url.protocol !== "https:" &&
                  !["localhost", "127.0.0.1"].includes(url.hostname)
                )
                  throw new Error("Base URL 需要 HTTPS");
              }
              onSave({ ...value, selected: active });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          保存设置
        </button>
      </footer>
    </Modal>
  );
}

import { useState } from "react";
import { Modal } from "./Modal";
import type { Settings } from "./types";
import { allModels, resolveModel } from "./config";
import SelectMenu from "./SelectMenu";
import ParameterControls from "./ParameterControls";
export default function NamingSettings({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [naming, setNaming] = useState(
      settings.naming ?? { model: "", state: {} },
    ),
    provider = resolveModel(settings, naming.model);
  return (
    <Modal title="命名模型设置" onClose={onClose}>
      <div className="model-config-fields">
        <label>
          命名模型
          <SelectMenu
            label="命名模型"
            value={provider ? naming.model : ""}
            options={[
              { value: "", label: "不启用" },
              ...allModels(settings).map((m) => ({
                value: m.id,
                label: m.provider.name + " / " + m.model,
              })),
            ]}
            onChange={(model) => setNaming({ model, state: {} })}
          />
        </label>
        {provider && (
          <ParameterControls
            key={provider.id}
            text={provider.customParameters ?? ""}
            state={naming.state}
            onChange={(state) => setNaming({ ...naming, state })}
          />
        )}
      </div>
      <footer className="modal-footer">
        <button className="secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          onClick={() =>
            onSave({ ...settings, naming: provider ? naming : undefined })
          }
        >
          保存
        </button>
      </footer>
    </Modal>
  );
}

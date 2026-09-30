import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { Settings, ParameterState } from "./types";
import { allModels, resolveModel } from "./config";
import ParameterControls from "./ParameterControls";
export default function ModelPicker({
  settings,
  onChange,
  onConfigure,
  state,
  onParameters,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onConfigure: () => void;
  state?: ParameterState;
  onParameters?: (s: ParameterState) => void;
}) {
  const [open, setOpen] = useState(false),
    host = useRef<HTMLDivElement>(null);
  const provider = resolveModel(settings);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="model-picker" ref={host}>
      <button
        className="model-trigger"
        aria-label="模型与参数"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{provider?.model || "选择模型"}</span>
        <ChevronDown className="model-chevron" size={16} />
      </button>
      {open && (
        <div className="model-menu model-parameter-menu" aria-label="模型配置">
          <div className="model-list">
            {allModels(settings).map((m) => (
              <button
                key={m.id}
                aria-pressed={m.id === settings.selected}
                onClick={() => onChange({ ...settings, selected: m.id })}
              >
                <span>
                  {m.model}
                  <small>{m.provider.name}</small>
                </span>
                {m.id === settings.selected && <Check size={15} />}
              </button>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                onConfigure();
              }}
            >
              模型提供商
            </button>
          </div>
          <div className="model-parameters">
            {provider && (
              <ParameterControls
                key={provider.id + provider.customParameters}
                text={provider.customParameters ?? ""}
                state={state}
                onChange={(s) => onParameters?.(s)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

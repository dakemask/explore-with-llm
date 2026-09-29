import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { Effort, Settings } from "./types";
export default function ModelPicker({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const [open, setOpen] = useState(false),
    host = useRef<HTMLDivElement>(null);
  const provider =
    settings.providers.find((p) => p.id === settings.selected) ??
    settings.providers[0];
  const effort = settings.effort ?? (settings.thinking ? "high" : "none");
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        host.current?.querySelector("button")?.focus();
      }
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
        aria-label="模型与思考档位"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{provider.model}</span>
        <span className="effort-value">{effort}</span>
        <ChevronDown className="model-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="model-menu" role="group" aria-label="模型配置">
          <div className="menu-label">模型</div>
          {settings.providers.map((p) => (
            <button
              key={p.id}
              aria-pressed={p.id === provider.id}
              onClick={() => onChange({ ...settings, selected: p.id })}
            >
              <span>
                {p.name}
                <small>{p.model}</small>
              </span>
              {p.id === provider.id && <Check size={15} />}
            </button>
          ))}
          <div className="menu-label">思考档位</div>
          <div className="effort-options">
            {(["none", "low", "high", "max"] as Effort[]).map((value) => (
              <button
                key={value}
                aria-pressed={effort === value}
                onClick={() => {
                  onChange({ ...settings, effort: value });
                  setOpen(false);
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

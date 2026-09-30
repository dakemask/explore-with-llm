import { useState } from "react";
import type { ParameterState } from "./types";
import {
  effectiveParameters,
  parseParameters,
  updateParameter,
} from "./parameters";
export default function ParameterControls({
  text,
  state = {},
  onChange,
}: {
  text: string;
  state?: ParameterState;
  onChange: (state: ParameterState) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  let parameters;
  try {
    parameters = parseParameters(text);
  } catch (e) {
    return <p className="inline-error">{(e as Error).message}</p>;
  }
  const effective = effectiveParameters(parameters, state);
  return (
    <div className="parameter-controls">
      {parameters
        .filter((p) => !p.raw)
        .map((p) => {
          const s = effective.state[p.id],
            blocked = !effective.adjustable[p.id],
            disabled = blocked || !s.enabled;
          const change = (patch: Partial<ParameterState[string]>) => {
            const next = updateParameter(parameters, state, p.id, patch);
            const after = effectiveParameters(parameters, next);
            setDrafts((old) =>
              Object.fromEntries(
                Object.entries(old).filter(
                  ([id]) =>
                    after.adjustable[id] &&
                    effective.adjustable[id] &&
                    after.state[id]?.enabled,
                ),
              ),
            );
            onChange(next);
          };
          return (
            <section
              className={
                "parameter-control " + (blocked ? "dependency-blocked" : "")
              }
              key={p.id}
            >
              <div className="parameter-heading">
                <strong title={p.description}>{p.name}</strong>
                {p.toggle && (
                  <button
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={"启用" + p.name}
                    disabled={blocked}
                    className="parameter-switch"
                    onClick={() => change({ enabled: !s.enabled })}
                  >
                    <span />
                  </button>
                )}
              </div>
              {blocked && <small className="muted">依赖条件未满足</small>}
              {p.type === "choice" && (
                <div className="parameter-options">
                  {p.options.map((o) => (
                    <button
                      key={o.id}
                      disabled={disabled}
                      aria-pressed={s.value === o.id}
                      onClick={() => change({ value: o.id })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {p.type === "number" && (
                <div className="parameter-number">
                  <input
                    aria-label={p.name + "滑条"}
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={Number(s.value)}
                    disabled={disabled}
                    onChange={(e) => {
                      setDrafts((d) => ({ ...d, [p.id]: e.target.value }));
                      change({ value: Number(e.target.value), invalid: false });
                    }}
                  />
                  <input
                    aria-label={p.name}
                    type="number"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    disabled={disabled}
                    value={
                      disabled
                        ? String(s.value)
                        : (drafts[p.id] ?? String(s.value))
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      setDrafts((d) => ({ ...d, [p.id]: raw }));
                      if (raw !== "" && e.currentTarget.validity.valid)
                        change({ value: Number(raw), invalid: false });
                      else change({ invalid: true });
                    }}
                    onBlur={(e) => {
                      if (
                        !e.currentTarget.validity.valid ||
                        e.target.value === ""
                      ) {
                        e.currentTarget.setCustomValidity(
                          "请输入范围内且符合步长的数值",
                        );
                      } else {
                        e.currentTarget.setCustomValidity("");
                        change({
                          value: Number(e.target.value),
                          invalid: false,
                        });
                      }
                    }}
                    onInput={(e) => e.currentTarget.setCustomValidity("")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </div>
              )}
              {s.invalid && !disabled && (
                <small className="inline-error">
                  请输入范围内且符合步长的数值
                </small>
              )}
              {p.type === "fixed" && (
                <span className="muted">
                  {s.enabled ? "发送固定配置" : "不发送"}
                </span>
              )}
            </section>
          );
        })}
      {!parameters.some((p) => !p.raw) && (
        <p className="muted">此模型没有可调节参数</p>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
export default function SelectMenu({
  label,
  value,
  options,
  onChange,
  up = false,
  disabled = false,
}: {
  label: string;
  value: string;
  options: {
    value: string;
    label: string;
    disabled?: boolean;
    reason?: string;
  }[];
  onChange: (v: string) => void;
  up?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);
  return (
    <div
      className="select-menu"
      ref={host}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="select-trigger"
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {options.find((o) => o.value === value)?.label ?? label}
        <ChevronDown size={16} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={"select-options " + (up ? "up" : "")}
        >
          {options.map((o) => (
            <button
              type="button"
              role="option"
              aria-selected={o.value === value}
              disabled={o.disabled}
              title={o.reason}
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

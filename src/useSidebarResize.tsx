import { useEffect, useRef, useState, type CSSProperties } from "react";
const storageKey = "explore-sidebar-widths";
type Widths = { left: number; right: number };
export function useSidebarResize(leftOpen: boolean, rightOpen: boolean) {
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [widths, setWidths] = useState<Widths>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.right))
        return saved;
    } catch {
      /* Storage may be unavailable. */
    }
    return {
      left: window.innerWidth <= 1200 ? 250 : 270,
      right: window.innerWidth <= 1200 ? 340 : 385,
    };
  });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ side: keyof Widths; x: number; width: number } | null>(
    null,
  );
  const latest = useRef(widths);
  latest.current = widths;
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const available = Math.max(850, viewport);
  const mainMin = Math.min(400, available - 540);
  const left = Math.max(
    240,
    Math.min(widths.left, 480, available - mainMin - (rightOpen ? 300 : 0)),
  );
  const right = Math.max(
    300,
    Math.min(widths.right, 720, available - mainMin - (leftOpen ? left : 0)),
  );
  const limit = (side: keyof Widths) =>
    Math.min(
      side === "left" ? 480 : 720,
      available -
        mainMin -
        (side === "left" ? (rightOpen ? right : 0) : leftOpen ? left : 0),
    );
  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(latest.current));
    } catch {
      /* Keep session widths. */
    }
  };
  const update = (side: keyof Widths, value: number) => {
    const next = {
      ...latest.current,
      [side]: Math.round(
        Math.max(side === "left" ? 240 : 300, Math.min(limit(side), value)),
      ),
    };
    latest.current = next;
    setWidths(next);
  };
  function handle(side: keyof Widths) {
    const width = side === "left" ? left : right;
    return (
      <div
        className={`sidebar-resizer ${side}-resizer`}
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={side === "left" ? "调整对话列表宽度" : "调整侧边提问宽度"}
        aria-valuemin={side === "left" ? 240 : 300}
        aria-valuemax={limit(side)}
        aria-valuenow={width}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { side, x: e.clientX, width };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current || drag.current.side !== side) return;
          update(
            side,
            drag.current.width +
              (e.clientX - drag.current.x) * (side === "left" ? 1 : -1),
          );
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          drag.current = null;
          setDragging(false);
          persist();
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onLostPointerCapture={() => {
          if (drag.current) {
            drag.current = null;
            setDragging(false);
            persist();
          }
        }}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          update(
            side,
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? limit(side)
                : width +
                  (e.key === "ArrowRight" ? 16 : -16) *
                    (side === "left" ? 1 : -1),
          );
          persist();
        }}
      />
    );
  }
  return {
    dragging,
    style: {
      "--left-width": `${left}px`,
      "--right-width": `${right}px`,
    } as CSSProperties,
    handles: (
      <>
        {leftOpen && handle("left")}
        {rightOpen && handle("right")}
      </>
    ),
  };
}

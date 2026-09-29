import { useLayoutEffect, useRef, useEffect } from "react";

// Temporary scroll space belongs to an interaction, never to ordinary scrolling.
export function useScrollAnchor(resetKey: string) {
  const pending = useRef<null | {
    scroller: HTMLElement;
    find: () => HTMLElement | null;
    y: number;
    until: number;
  }>(null);
  const frame = useRef(0);
  const spaces = useRef(
    new Map<HTMLElement, { top: HTMLElement; bottom: HTMLElement }>(),
  );
  function getSpaces(scroller: HTMLElement) {
    let entry = spaces.current.get(scroller);
    if (!entry) {
      const host =
        scroller.querySelector<HTMLElement>(".chat-width") || scroller;
      const top = document.createElement("div"),
        bottom = document.createElement("div");
      for (const el of [top, bottom]) {
        el.className = "scroll-reserve";
        el.setAttribute("aria-hidden", "true");
      }
      host.prepend(top);
      host.append(bottom);
      entry = { top, bottom };
      spaces.current.set(scroller, entry);
    }
    return entry;
  }
  function settle() {
    const anchor = pending.current;
    if (!anchor) return;
    const target = anchor.find();
    if (!target?.isConnected) {
      pending.current = null;
      return;
    }
    const { scroller } = anchor,
      { top, bottom } = getSpaces(scroller);
    let wanted =
      scroller.scrollTop + target.getBoundingClientRect().top - anchor.y;
    if (wanted < 0) {
      top.style.height = `${top.offsetHeight - wanted}px`;
      wanted = 0;
    }
    const natural = scroller.scrollHeight - bottom.offsetHeight;
    bottom.style.height = `${Math.max(0, Math.ceil(wanted + scroller.clientHeight - natural))}px`;
    scroller.scrollTop = wanted;
  }
  function capture(
    element: HTMLElement,
    find: () => HTMLElement | null = () => element,
  ) {
    const scroller = element.closest<HTMLElement>(".main-scroll, .side-scroll");
    if (!scroller) return;
    cancelAnimationFrame(frame.current);
    pending.current = {
      scroller,
      find,
      y: element.getBoundingClientRect().top,
      until: performance.now() + 400,
    };
    const { top, bottom } = getSpaces(scroller);
    // Prevent native clamping before React commits a shorter branch.
    bottom.style.height = `${bottom.offsetHeight + scroller.scrollHeight}px`;
    top.style.height = "0px";
    const tick = () => {
      settle();
      if (pending.current && performance.now() < pending.current.until)
        frame.current = requestAnimationFrame(tick);
      else pending.current = null;
    };
    frame.current = requestAnimationFrame(tick);
  }
  useLayoutEffect(() => {
    settle();
  });
  useEffect(() => {
    const release = () => {
      pending.current = null;
      cancelAnimationFrame(frame.current);
    };
    const wheel = (e: WheelEvent) => {
      release();
      const scroller = (e.target as Element).closest<HTMLElement>(
        ".main-scroll, .side-scroll",
      );
      const entry = scroller && spaces.current.get(scroller);
      // A short branch may fit exactly in the viewport. Consume its leading
      // reserve even when there is no native scroll range to emit a scroll event.
      if (
        scroller &&
        entry &&
        scroller.scrollTop < 1 &&
        e.deltaY > 0 &&
        entry.top.offsetHeight
      ) {
        entry.top.style.height = `${Math.max(0, entry.top.offsetHeight - e.deltaY)}px`;
      }
    };
    document.addEventListener("wheel", wheel, { passive: true });
    document.addEventListener("touchstart", release, { passive: true });
    document.addEventListener("pointerdown", release);
    const key = (e: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(e.key)
      )
        release();
    };
    document.addEventListener("keydown", key);
    return () => {
      release();
      document.removeEventListener("wheel", wheel);
      document.removeEventListener("touchstart", release);
      document.removeEventListener("pointerdown", release);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useLayoutEffect(() => {
    pending.current = null;
    cancelAnimationFrame(frame.current);
    for (const { top, bottom } of spaces.current.values()) {
      top.remove();
      bottom.remove();
    }
    spaces.current.clear();
  }, [resetKey]);
  function onScroll(scroller: HTMLElement) {
    if (pending.current?.scroller === scroller) return;
    const entry = spaces.current.get(scroller);
    if (!entry) return;
    const { top, bottom } = entry;
    const natural = scroller.scrollHeight - bottom.offsetHeight;
    bottom.style.height = `${Math.min(bottom.offsetHeight, Math.max(0, Math.ceil(scroller.scrollTop + scroller.clientHeight - natural)))}px`;
    if (scroller.scrollTop < 1) bottom.style.height = "0px";
    if (top.offsetHeight && scroller.scrollTop > 0) {
      const amount = Math.min(top.offsetHeight, scroller.scrollTop);
      top.style.height = `${top.offsetHeight - amount}px`;
      scroller.scrollTop -= amount;
    }
  }
  return { capture, onScroll, isAnchoring: () => !!pending.current };
}

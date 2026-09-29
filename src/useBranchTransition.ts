import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

export function useBranchTransition(resetKey: string) {
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => {
    cleanup.current();
    return () => cleanup.current();
  }, [resetKey]);
  return (
    source: HTMLElement,
    targetId: string,
    change: () => void,
    direction = 1,
  ) => {
    cleanup.current();
    const scroller = source.closest<HTMLElement>(".main-scroll");
    if (
      !scroller ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      flushSync(change);
      return;
    }
    const rect = scroller.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "branch-transition-snapshot";
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    Object.assign(overlay.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    for (
      let node: Element | null = source;
      node;
      node = node.nextElementSibling
    ) {
      if (!node.matches(".message")) continue;
      const box = node.getBoundingClientRect();
      if (box.bottom < rect.top || box.top > rect.bottom) continue;
      const clone = node.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      clone.classList.remove("focused");
      clone.querySelectorAll<HTMLElement>(".avatar").forEach((avatar) => {
        avatar.style.visibility = "hidden";
      });
      clone
        .querySelectorAll("[aria-label], [aria-controls], [aria-labelledby]")
        .forEach((el) => {
          el.removeAttribute("aria-label");
          el.removeAttribute("aria-controls");
          el.removeAttribute("aria-labelledby");
        });
      if (node === source) {
        const controls = clone.querySelector<HTMLElement>(".message-tools");
        if (controls) controls.style.visibility = "hidden";
      }
      clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      Object.assign(clone.style, {
        position: "absolute",
        margin: "0",
        left: `${box.left - rect.left}px`,
        top: `${box.top - rect.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
      overlay.append(clone);
    }
    document.body.append(overlay);
    flushSync(change);
    const animations: Animation[] = [];
    const timing = { duration: 180, easing: "cubic-bezier(.22,.7,.25,1)" };
    for (const clone of overlay.children) {
      animations.push(
        clone.animate(
          [
            { opacity: 1, transform: "translateX(0)" },
            { opacity: 0, transform: `translateX(${-direction * 8}px)` },
          ],
          { ...timing, fill: "forwards" },
        ),
      );
    }
    const target = document.getElementById(`message-${targetId}`);
    target?.classList.add("branch-transition-active");
    for (
      let node: Element | null = target;
      node;
      node = node.nextElementSibling
    ) {
      if (!node.matches(".message")) continue;
      // Transforming the heading changes the absolute avatar's containing
      // block. Keep headings stationary and animate only message content.
      const moving = Array.from(node.children).filter(
        (child) =>
          !child.matches(".message-heading") &&
          !(node === target && child.matches(".message-tools")),
      );
      for (const content of moving)
        animations.push(
          content.animate(
            [
              { opacity: 0, transform: `translateX(${direction * 8}px)` },
              { opacity: 1, transform: "translateX(0)" },
            ],
            timing,
          ),
        );
    }
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
      overlay.remove();
      target?.classList.remove("branch-transition-active");
      scroller.removeEventListener("wheel", finish);
      scroller.removeEventListener("touchstart", finish);
      window.removeEventListener("resize", finish);
    };
    cleanup.current = finish;
    scroller.addEventListener("wheel", finish, { passive: true });
    scroller.addEventListener("touchstart", finish, { passive: true });
    window.addEventListener("resize", finish);
    timer = setTimeout(finish, 190);
  };
}

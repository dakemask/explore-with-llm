// Rasterize visible labels and controls locally; no external capture dependency.
export async function disappearParameter(
  element: HTMLElement,
  signal: AbortSignal,
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bounds = element.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const padding = 60;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width + padding * 2);
  canvas.height = Math.ceil(bounds.height + padding * 2);
  Object.assign(canvas.style, {
    position: "fixed",
    left: `${bounds.left - padding}px`,
    top: `${bounds.top - padding}px`,
    width: `${canvas.width}px`,
    height: `${canvas.height}px`,
    pointerEvents: "none",
    zIndex: "10000",
  });
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.parameterParticles = "true";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent?.trim() || !node.parentElement) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    const style = getComputedStyle(node.parentElement);
    ctx.font = style.font;
    ctx.fillStyle = style.color;
    ctx.textBaseline = "middle";
    ctx.fillText(
      node.textContent.trim(),
      rect.left - bounds.left + padding,
      rect.top - bounds.top + padding + rect.height / 2,
    );
  }
  for (const control of element.querySelectorAll("button, input")) {
    const rect = control.getBoundingClientRect();
    const style = getComputedStyle(control);
    const x = rect.left - bounds.left + padding,
      y = rect.top - bounds.top + padding;
    ctx.strokeStyle = style.borderColor || style.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, rect.width, rect.height);
    if (control instanceof HTMLInputElement) {
      ctx.fillStyle = style.color;
      if (control.type === "range") {
        ctx.fillRect(x, y + rect.height / 2, rect.width, 2);
      } else {
        ctx.font = style.font;
        ctx.textBaseline = "middle";
        ctx.fillText(control.value, x + 8, y + rect.height / 2);
      }
    }
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const particles: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    color: string;
    alpha: number;
    delay: number;
  }[] = [];
  for (let y = 0; y < canvas.height; y += 2)
    for (let x = 0; x < canvas.width; x += 2) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i + 3] < 25) continue;
      particles.push({
        x,
        y,
        dx: 15 + Math.random() * 48,
        dy: (Math.random() - 0.65) * 65,
        color: `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`,
        alpha: pixels[i + 3] / 255,
        delay: (x / canvas.width) * 0.2,
      });
    }
  // Stay in the same document/top layer as the controls (including dialogs).
  (element.closest("dialog") ?? document.body).append(canvas);
  element.style.opacity = "0";
  let frame = 0;
  try {
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const finish = () => {
        cancelAnimationFrame(frame);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      signal.addEventListener("abort", finish, { once: true });
      const draw = (time: number) => {
        if (signal.aborted) return finish();
        const progress = (time - start) / 520;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of particles) {
          const t = Math.max(0, Math.min(1, (progress - p.delay) / 0.8));
          ctx.globalAlpha = p.alpha * (1 - t);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x + p.dx * t, p.y + p.dy * t + 12 * t * t, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
        if (progress >= 1) finish();
        else frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    });
    if (signal.aborted) return;
    const animation = element.animate(
      [{ height: `${bounds.height}px` }, { height: "0px" }],
      {
        duration: 180,
        easing: "ease-out",
        fill: "forwards",
      },
    );
    const cancel = () => animation.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await animation.finished;
      // Keep the final layout until React removes this node. Cancelling a
      // forwards-filled animation alone would restore its original height.
      if (!signal.aborted) element.style.height = "0px";
    } catch {
      /* Interrupted by reopening. */
    } finally {
      signal.removeEventListener("abort", cancel);
      animation.cancel();
    }
  } finally {
    canvas.remove();
    element.style.removeProperty("opacity");
    if (signal.aborted) element.style.removeProperty("height");
  }
}

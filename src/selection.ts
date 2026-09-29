import { decodeHTML } from "entities";
import type { Question } from "./types";
// Map decoded Markdown text to source boundaries (UTF-16, as used by DOM Range).
export function sourceMap(
  raw: string,
  visible: string,
  start: number,
): number[] | null {
  let decoded = "",
    bounds = [start];
  for (let i = 0; i < raw.length;) {
    let value = raw[i],
      length = 1;
    if (
      raw[i] === "\\" &&
      /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(raw[i + 1] ?? "")
    ) {
      value = raw[i + 1];
      length = 2;
    } else if (raw[i] === "&") {
      const entity = raw
        .slice(i)
        .match(/^&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][\da-zA-Z]*);/);
      if (entity) {
        value = decodeHTML(entity[0]);
        length = entity[0].length;
      }
    } else if (raw[i] === "\r" && raw[i + 1] === "\n") {
      value = "\n";
      length = 2;
    }
    decoded += value;
    for (let j = 0; j < value.length; j++)
      bounds.push(start + i + (j === value.length - 1 ? length : 0));
    i += length;
  }
  return decoded === visible ? bounds : null;
}
export function sourceAnnotations(options: {
  source: string;
  questions: Question[];
}) {
  return (tree: any) => {
    const { source, questions } = options;
    const wrap = (value: string, bounds: number[]) => {
      const cuts = new Set([0, value.length]);
      for (let i = 1; i < bounds.length - 1; i++)
        if (questions.some((q) => q.start === bounds[i] || q.end === bounds[i]))
          cuts.add(i);
      const positions = [...cuts].sort((a, b) => a - b);
      return positions.slice(0, -1).map((a, i) => {
        const b = positions[i + 1],
          ids = questions
            .filter((q) => q.start < bounds[b] && q.end > bounds[a])
            .map((q) => q.id);
        return {
          type: "element",
          tagName: "span",
          properties: {
            "data-source-map": JSON.stringify(bounds.slice(a, b + 1)),
            ...(ids.length
              ? {
                  "data-questions": ids.join(","),
                  className: ["question-highlight"],
                }
              : {}),
          },
          children: [{ type: "text", value: value.slice(a, b) }],
        };
      });
    };
    function walk(
      node: any,
      inCode = false,
      cursor?: { value: number; end: number },
    ) {
      if (!node.children) return;
      const cls = (node.properties?.className ?? []).join(" ");
      if (/katex|math/.test(cls)) return;
      if (node.tagName === "code") {
        const text = flatten(node),
          a = node.position?.start?.offset,
          b = node.position?.end?.offset;
        if (a !== undefined) {
          const raw = source.slice(a, b),
            found = raw.indexOf(text.replace(/\n$/, ""));
          if (found >= 0)
            cursor = {
              value: a + found,
              end: a + found + text.replace(/\n$/, "").length,
            };
        }
        inCode = true;
      }
      const next: any[] = [];
      for (const child of node.children) {
        if (child.type === "text") {
          const a = child.position?.start?.offset,
            b = child.position?.end?.offset;
          let bounds =
            a !== undefined
              ? sourceMap(source.slice(a, b), child.value, a)
              : null;
          if (inCode && cursor) {
            const length = Math.min(
              child.value.length,
              Math.max(0, cursor.end - cursor.value),
            );
            if (length === child.value.length)
              bounds = Array.from(
                { length: length + 1 },
                (_, i) => cursor!.value + i,
              );
            cursor.value += child.value.length;
          }
          next.push(...(bounds ? wrap(child.value, bounds) : [child]));
        } else {
          walk(child, inCode, cursor);
          next.push(child);
        }
      }
      node.children = next;
    }
    walk(tree);
  };
}
function flatten(n: any): string {
  return n.type === "text" ? n.value : (n.children ?? []).map(flatten).join("");
}
export function selectedSource(
  root: HTMLElement,
): { start: number; end: number; quote: string; rect: DOMRect } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null;
  for (const math of root.querySelectorAll(".katex"))
    if (range.intersectsNode(math)) return null;
  const boundary = (node: Node, offset: number, end: boolean) => {
    const el = (
      node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
    )?.closest("[data-source-map]");
    if (!el || !root.contains(el)) return null;
    const bounds = JSON.parse(el.getAttribute("data-source-map")!) as number[];
    const local = document.createRange();
    local.selectNodeContents(el);
    local.setEnd(node, offset);
    const index = local.toString().length;
    return (
      bounds[Math.min(index, bounds.length - 1)] ??
      (end ? bounds.at(-1)! : bounds[0])
    );
  };
  const start = boundary(range.startContainer, range.startOffset, false),
    end = boundary(range.endContainer, range.endOffset, true);
  if (start === null || end === null || end <= start) return null;
  return {
    start,
    end,
    quote: selection.toString(),
    rect: range.getBoundingClientRect(),
  };
}

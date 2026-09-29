import type { Conversation, Message, Question } from "./types";
export const uid = () => crypto.randomUUID();
export function createConversation(): Conversation {
  const id = uid(),
    root = uid();
  return {
    id,
    title: "新的对话",
    pinned: false,
    created: Date.now(),
    updated: Date.now(),
    root,
    nodes: {
      [root]: {
        id: root,
        parent: null,
        role: "system",
        created: Date.now(),
        content: "You are a helpful assistant.",
        images: [],
      },
    },
    questions: [],
    choices: {},
    tabs: {},
    current: root,
    draft: "",
    images: [],
  };
}
export function ancestors(c: Conversation, id: string): Message[] {
  const path: Message[] = [],
    seen = new Set<string>();
  let n = c.nodes[id];
  while (n && !seen.has(n.id)) {
    path.unshift(n);
    seen.add(n.id);
    n = n.parent ? c.nodes[n.parent] : undefined!;
  }
  return path;
}
export function children(c: Conversation, parent: string, side?: string) {
  return Object.values(c.nodes).filter(
    (n) => n.parent === parent && n.side === side,
  );
}
export function path(c: Conversation, side?: string): Message[] {
  const q = side ? c.questions.find((q) => q.id === side) : undefined;
  let parent = q?.owner ?? c.root;
  const result: Message[] = [],
    seen = new Set<string>();
  while (!seen.has(parent)) {
    seen.add(parent);
    const next = children(c, parent, side);
    const n =
      next.find(
        (n) => n.id === c.choices[side ? `${parent}:${side}` : parent],
      ) ?? next[0];
    if (!n) break;
    result.push(n);
    parent = n.id;
  }
  return result;
}
export function navigate(c: Conversation, id: string) {
  const target = c.nodes[id];
  if (!target) return;
  for (const n of ancestors(c, id))
    if (n.parent) c.choices[n.side ? `${n.parent}:${n.side}` : n.parent] = n.id;
  const q = target.side && c.questions.find((q) => q.id === target.side);
  if (q) {
    c.current = q.owner;
    c.tabs[q.owner] = q.id;
  } else c.current = id;
}
export function append(
  c: Conversation,
  parent: string,
  role: Message["role"],
  content: string,
  side?: string,
): Message {
  const p = c.nodes[parent];
  if (!p) throw new Error("父消息已不存在");
  const firstSide =
    side && c.questions.some((q) => q.id === side && q.owner === parent);
  if (
    !firstSide &&
    ((role === "user" && p.role === "user") ||
      (role === "assistant" && p.role !== "user"))
  )
    throw new Error("消息必须交替出现");
  if (side && children(c, parent, side).length)
    throw new Error("侧边提问不允许分支");
  const n: Message = {
    id: uid(),
    parent,
    role,
    content,
    side,
    images: [],
    created: Date.now(),
  };
  c.nodes[n.id] = n;
  c.choices[side ? `${parent}:${side}` : parent] = n.id;
  if (!side) c.current = n.id;
  c.updated = Date.now();
  return n;
}
export function descendants(c: Conversation, id: string): Set<string> {
  const found = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of Object.values(c.nodes))
      if (n.parent && found.has(n.parent) && !found.has(n.id)) {
        found.add(n.id);
        changed = true;
      }
  }
  return found;
}
export function removeNode(c: Conversation, id: string) {
  if (id === c.root) throw new Error("系统消息不可删除");
  const ids = descendants(c, id),
    parent = c.nodes[id]?.parent;
  c.questions = c.questions.filter((q) => !ids.has(q.owner));
  for (const n of ids) delete c.nodes[n];
  for (const [key, value] of Object.entries(c.choices))
    if (ids.has(value)) delete c.choices[key];
  for (const key of Object.keys(c.tabs)) if (ids.has(key)) delete c.tabs[key];
  if (ids.has(c.current))
    c.current = parent && c.nodes[parent] ? parent : c.root;
}
export function removeQuestion(c: Conversation, id: string) {
  const q = c.questions.find((q) => q.id === id);
  if (!q) return;
  for (const n of Object.values(c.nodes))
    if (n.side === id) delete c.nodes[n.id];
  c.questions = c.questions.filter((q) => q.id !== id);
  if (c.tabs[q.owner] === id)
    c.tabs[q.owner] =
      c.questions.find((other) => other.owner === q.owner && other.id !== id)
        ?.id ?? "";
  for (const key of Object.keys(c.choices))
    if (key.endsWith(`:${id}`)) delete c.choices[key];
}
export function protectedRanges(questions: Question[], owner: string) {
  const ranges: { start: number; end: number }[] = [];
  for (const q of questions
    .filter((q) => q.owner === owner)
    .sort((a, b) => a.start - b.start)) {
    const last = ranges.at(-1);
    if (last && q.start <= last.end) last.end = Math.max(last.end, q.end);
    else ranges.push({ start: q.start, end: q.end });
  }
  return ranges;
}
// Editable gaps keep positional identity even when protected text occurs elsewhere.
export function editSegments(c: Conversation, id: string) {
  const content = c.nodes[id].content,
    segments: { text: string; locked: boolean; start: number }[] = [];
  let cursor = 0;
  for (const r of protectedRanges(c.questions, id)) {
    segments.push(
      { text: content.slice(cursor, r.start), locked: false, start: cursor },
      { text: content.slice(r.start, r.end), locked: true, start: r.start },
    );
    cursor = r.end;
  }
  segments.push({ text: content.slice(cursor), locked: false, start: cursor });
  return segments;
}
export function applyEdit(
  c: Conversation,
  id: string,
  segments: ReturnType<typeof editSegments>,
) {
  const original = editSegments(c, id);
  if (original.length !== segments.length)
    throw new Error("选区已变化，请重新打开编辑窗口");
  const anchors = c.questions
    .filter((q) => q.owner === id)
    .map((q) => ({ q, start: q.start, end: q.end }));
  let offset = 0;
  for (let i = 0; i < original.length; i++) {
    const old = original[i],
      next = segments[i];
    if (old.locked) {
      if (next.text !== old.text) throw new Error("被提问的文字不可修改");
      const delta = offset - old.start;
      for (const anchor of anchors.filter(
        (a) => a.start >= old.start && a.end <= old.start + old.text.length,
      )) {
        anchor.q.start = anchor.start + delta;
        anchor.q.end = anchor.end + delta;
      }
    }
    offset += next.text.length;
  }
  c.nodes[id].content = segments.map((s) => s.text).join("");
  c.nodes[id].edited = true;
}

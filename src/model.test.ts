import { describe, it, expect } from "vitest";
import {
  createConversation,
  append,
  ancestors,
  applyEdit,
  editSegments,
  navigate,
  path,
  removeNode,
  removeQuestion,
} from "./model";
import { sourceMap } from "./selection";
function fixture() {
  const c = createConversation();
  const u = append(c, c.root, "user", "问题");
  const a = append(c, u.id, "assistant", "same / same / tail");
  return { c, u, a };
}
function question(
  c: ReturnType<typeof createConversation>,
  owner: string,
  id = "q",
  start = 7,
  end = 11,
) {
  c.questions.push({
    id,
    owner,
    start,
    end,
    quote: c.nodes[owner].content.slice(start, end),
    draft: "",
    images: [],
  });
  return id;
}
describe("conversation semantics", () => {
  it("new branch leaves descendants attached to the original and remembers chosen descendants", () => {
    const { c, u, a } = fixture();
    const u2 = append(c, a.id, "user", "继续");
    const a2 = append(c, u2.id, "assistant", "后续");
    const alternate = append(c, u.id, "assistant", "其他");
    expect(path(c).map((n) => n.id)).toEqual([u.id, alternate.id]);
    navigate(c, a.id);
    expect(path(c).map((n) => n.id)).toEqual([u.id, a.id, u2.id, a2.id]);
  });
  it("side history includes latest ancestors, never sibling paths or other side threads", () => {
    const { c, u, a } = fixture();
    question(c, a.id);
    const su = append(c, a.id, "user", "追问", "q");
    c.nodes[u.id].content = "改后的问题";
    expect(ancestors(c, su.id).map((n) => n.content)).toEqual([
      "You are a helpful assistant.",
      "改后的问题",
      a.content,
      "追问",
    ]);
    expect(() => append(c, a.id, "user", "分支", "q")).toThrow();
  });
  it("protects exact repeated occurrence and moves overlapping anchors with preceding edits", () => {
    const { c, a } = fixture();
    question(c, a.id);
    question(c, a.id, "q2", 8, 11);
    const segments = editSegments(c, a.id);
    segments[0].text = "a much longer prefix / ";
    applyEdit(c, a.id, segments);
    expect(c.nodes[a.id].content).toBe("a much longer prefix / same / tail");
    expect(
      c.questions.map((q) => c.nodes[a.id].content.slice(q.start, q.end)),
    ).toEqual(["same", "ame"]);
    expect(c.questions[0].start).toBe(23);
  });
  it("does not accidentally remap anchors twice across separate protected ranges", () => {
    const { c, a } = fixture();
    question(c, a.id, "first", 0, 4);
    question(c, a.id, "last", 14, 18);
    const parts = editSegments(c, a.id);
    parts[0].text = "012345678901234";
    applyEdit(c, a.id, parts);
    expect(c.questions.map((q) => [q.start, q.end])).toEqual([
      [15, 19],
      [29, 33],
    ]);
  });
  it("rejects edits to protected text", () => {
    const { c, a } = fixture();
    question(c, a.id);
    const parts = editSegments(c, a.id);
    parts.find((s) => s.locked)!.text = "changed";
    expect(() => applyEdit(c, a.id, parts)).toThrow();
  });
  it("deletes descendants including side questions but keeps sibling branches", () => {
    const { c, u, a } = fixture();
    question(c, a.id);
    const side = append(c, a.id, "user", "侧栏", "q");
    append(c, side.id, "assistant", "回复", "q");
    const sibling = append(c, u.id, "assistant", "保留");
    removeNode(c, a.id);
    expect(c.questions).toHaveLength(0);
    expect(Object.values(c.nodes).some((n) => n.side)).toBe(false);
    expect(c.nodes[sibling.id]).toBeDefined();
  });
  it("deleting one question only removes its own chain and selects same-owner tab", () => {
    const { c, a } = fixture();
    question(c, a.id, "q");
    question(c, c.root, "foreign", 0, 2);
    question(c, a.id, "q2");
    c.tabs[a.id] = "q";
    append(c, a.id, "user", "侧栏", "q");
    removeQuestion(c, "q");
    expect(c.tabs[a.id]).toBe("q2");
    expect(c.questions).toHaveLength(2);
  });
  it("maps escaped punctuation and entities without confusing raw offsets", () => {
    expect(sourceMap("a &amp; b", "a & b", 10)).toEqual([
      10, 11, 12, 17, 18, 19,
    ]);
    expect(sourceMap("a\\*b", "a*b", 0)).toEqual([0, 1, 3, 4]);
  });
});
import { normalizeMath } from "./math";
it("normalizes conventional LaTeX delimiters without moving source offsets or code", () => {
  const raw = "前 \\(x\\) 后\n\\[\ny\n\\]\n`\\(code\\)`";
  const result = normalizeMath(raw);
  expect(result.length).toBe(raw.length);
  expect(result).toContain("$ x $");
  expect(result).toContain("`\\(code\\)`");
});

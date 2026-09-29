import { useEffect, useRef } from "react";
import { EditorState, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { editSegments } from "./model";
type Segments = ReturnType<typeof editSegments>;
export default function ProtectedEditor({
  segments,
  onChange,
  onBlocked,
}: {
  segments: Segments;
  onChange: (value: Segments) => void;
  onBlocked: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onBlocked });
  callbacks.current = { onChange, onBlocked };
  useEffect(() => {
    let offset = 0;
    const initial = segments.flatMap((segment, index) => {
      const from = offset;
      offset += segment.text.length;
      return segment.locked ? [{ from, to: offset, index }] : [];
    });
    const locks = StateField.define({
      create: () => initial,
      update: (ranges, tr) =>
        ranges.map((r) => ({
          ...r,
          from: tr.changes.mapPos(r.from, 1),
          to: tr.changes.mapPos(r.to, -1),
        })),
      provide: (field) =>
        EditorView.decorations.from(field, (ranges) =>
          Decoration.set(
            ranges.map((r) =>
              Decoration.mark({
                class: "protected-text",
                attributes: { title: "删除关联侧边提问后可修改" },
              }).range(r.from, r.to),
            ),
          ),
        ),
    });
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: segments.map((s) => s.text).join(""),
        extensions: [
          locks,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "编辑消息内容",
            role: "textbox",
            "aria-multiline": "true",
          }),
          EditorState.transactionFilter.of((tr) => {
            if (!tr.docChanged) return tr;
            let blocked = false;
            tr.changes.iterChangedRanges((from, to) => {
              if (
                tr.startState
                  .field(locks)
                  .some((r) =>
                    from === to
                      ? from > r.from && from < r.to
                      : from < r.to && to > r.from,
                  )
              )
                blocked = true;
            });
            if (blocked) {
              queueMicrotask(() => callbacks.current.onBlocked());
              return [];
            }
            return tr;
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const ranges = update.state.field(locks),
              doc = update.state.doc;
            let cursor = 0;
            const next = segments.map((s) => ({ ...s }));
            for (const r of ranges) {
              next[r.index - 1].text = doc.sliceString(cursor, r.from);
              next[r.index].text = doc.sliceString(r.from, r.to);
              cursor = r.to;
            }
            next[next.length - 1].text = doc.sliceString(cursor);
            callbacks.current.onChange(next);
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, []);
  return <div className="continuous-editor" ref={host} />;
}

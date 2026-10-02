import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { sourceAnnotations } from "./selection";
import type { Question } from "./types";
import { normalizeMath } from "./math";
function Markdown({
  text,
  questions = [],
}: {
  text: string;
  questions?: Question[];
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeKatex,
        rehypeHighlight,
        [sourceAnnotations, { source: text, questions }],
      ]}
      components={{
        a: ({ children, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        img: () => null,
      }}
    >
      {normalizeMath(text)}
    </ReactMarkdown>
  );
}

// Only the quote boundaries affect annotations. Drafts and titles don't change
// the rendered body, even when callers construct a new questions array.
export default memo(Markdown, (previous, next) => {
  const before = previous.questions ?? [],
    after = next.questions ?? [];
  return (
    previous.text === next.text &&
    before.length === after.length &&
    before.every((question, index) => {
      const other = after[index];
      return (
        question.id === other.id &&
        question.start === other.start &&
        question.end === other.end
      );
    })
  );
});

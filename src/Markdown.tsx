import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { sourceAnnotations } from "./selection";
import type { Question } from "./types";
import { normalizeMath } from "./math";
export default function Markdown({
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

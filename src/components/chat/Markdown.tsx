import { memo, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { normalizeMathMapped, rehypeAnchors, type AnchorMark } from '../../lib/anchor'
import { CodeBox } from '../ui/CodeBox'

/** Models often emit \( \) and \[ \] delimiters; remark-math only understands $ / $$. */
export function normalizeMath(src: string) {
  return normalizeMathMapped(src).text
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
}

const remarkPlugins = [remarkGfm, [remarkMath, { singleDollarTextMath: true }]] as const
const rehypePlugins = [[rehypeHighlight, { detect: false, ignoreMissing: true }], rehypeKatex] as const

/**
 * With `anchors` (even empty), every text run carries its source range so selections can be mapped back
 * to the source (see lib/anchor), and anchored ranges are highlighted.
 */
export const Markdown = memo(function Markdown({
  text,
  className,
  anchors,
}: {
  text: string
  className?: string
  anchors?: AnchorMark[]
}) {
  const norm = useMemo(() => normalizeMathMapped(text), [text])
  const rehype = useMemo(
    () => (anchors ? [...rehypePlugins, [rehypeAnchors, { orig: text, norm, anchors }]] : rehypePlugins),
    [anchors, text, norm],
  )
  return (
    <div className={className ? `prose ${className}` : 'prose'}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins as never}
        rehypePlugins={rehype as never}
        components={components}
      >
        {norm.text}
      </ReactMarkdown>
    </div>
  )
})

function CodeBlock({ children }: { children: ReactNode }) {
  // children is the <code> element; pull language and raw text off it.
  const code = children as { props?: { className?: string; children?: ReactNode } }
  const lang = /language-([\w+-]+)/.exec(code?.props?.className ?? '')?.[1] ?? ''
  return (
    <CodeBox label={lang || 'text'} copyText={extractText(code?.props?.children)} className="my-3">
      {children}
    </CodeBox>
  )
}

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

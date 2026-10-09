import { memo, useMemo, type ReactElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { normalizeMathMapped, rehypeAnchors, remarkBreaksMapped, type AnchorMark } from '../../lib/anchor'
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
/** For text people typed: a single Enter is a line break, as it was when they wrote it. */
const remarkPluginsBreaks = [...remarkPlugins, remarkBreaksMapped] as const
const rehypePlugins = [[rehypeHighlight, { detect: false, ignoreMissing: true }], rehypeKatex] as const

/**
 * Rendered trees by their input, most recent last: a turn shown again (switching back to a version, a tree
 * map jump) isn't parsed, highlighted and typeset again — that made switching stall. (React elements can be
 * rendered any number of times.)
 */
const rendered = new Map<string, ReactElement>()
const KEEP = 300

function render(key: string, make: () => ReactElement) {
  const hit = rendered.get(key)
  if (hit) {
    rendered.delete(key)
    rendered.set(key, hit)
    return hit
  }
  const tree = make()
  rendered.set(key, tree)
  if (rendered.size > KEEP) rendered.delete(rendered.keys().next().value!)
  return tree
}

/**
 * With `anchors` (even empty), every text run carries its source range so selections can be mapped back
 * to the source (see lib/anchor), and anchored ranges are highlighted.
 */
export const Markdown = memo(function Markdown({
  text,
  className,
  anchors,
  breaks,
  live,
}: {
  text: string
  className?: string
  anchors?: AnchorMark[]
  /** Keep single newlines as line breaks. */
  breaks?: boolean
  /** Still streaming: not kept (every chunk is a new text). */
  live?: boolean
}) {
  const norm = useMemo(() => normalizeMathMapped(text), [text])
  const rehype = useMemo(
    () => (anchors ? [...rehypePlugins, [rehypeAnchors, { orig: text, norm, anchors }]] : rehypePlugins),
    [anchors, text, norm],
  )
  const tree = useMemo(() => {
    const make = () =>
      ReactMarkdown({
        remarkPlugins: (breaks ? remarkPluginsBreaks : remarkPlugins) as never,
        rehypePlugins: rehype as never,
        components,
        children: norm.text,
      })
    return live ? make() : render(`${breaks ? 'b' : ''}|${anchors ? JSON.stringify(anchors) : ''}|${text}`, make)
  }, [breaks, anchors, text, rehype, norm, live])
  return <div className={className ? `prose ${className}` : 'prose'}>{tree}</div>
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

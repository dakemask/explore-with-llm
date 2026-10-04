import { Check, Copy } from 'lucide-react'
import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { useT } from '../../i18n'
import { copyText } from '../../lib/clipboard'

/** Models often emit \( \) and \[ \] delimiters; remark-math only understands $ / $$. */
export function normalizeMath(src: string) {
  // Leave code (fenced blocks and inline spans) untouched.
  return src
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`),
    )
    .join('')
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
}

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className ? `prose ${className}` : 'prose'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }], rehypeKatex]}
        components={components}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  )
})

function CodeBlock({ children }: { children: ReactNode }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  // children is the <code> element; pull language and raw text off it.
  const code = children as { props?: { className?: string; children?: ReactNode } }
  const lang = /language-([\w+-]+)/.exec(code?.props?.className ?? '')?.[1] ?? ''
  const raw = extractText(code?.props?.children)

  const copy = async () => {
    await copyText(raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group/code my-3 overflow-hidden rounded-lg border border-border bg-code-bg">
      <div className="flex h-8 items-center justify-between border-b border-border px-3 text-xs text-faint">
        <span className="font-mono">{lang || 'text'}</span>
        <button onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-text">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t('msg.copied') : t('msg.copy')}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed">{children}</pre>
    </div>
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

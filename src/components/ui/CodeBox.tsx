import clsx from 'clsx'
import { Check, Copy } from 'lucide-react'
import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { useCopy } from '../../lib/hooks'

/** Class for small text buttons in a CodeBox label bar. */
export const codeBoxAction =
  'flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-hover hover:text-text'

/** Monospace block with a label bar and a copy button. */
export function CodeBox({
  label,
  copyText,
  children,
  className,
  maxHeight,
  wrap,
  actions,
  bodyClassName,
}: {
  label: ReactNode
  /** Raw text the copy button puts on the clipboard. */
  copyText: string
  /** Rendered content; usually highlighted code or plain text. */
  children: ReactNode
  className?: string
  /** Scroll vertically past this height (CSS length). */
  maxHeight?: string
  /** Wrap long lines instead of scrolling sideways; for prose rather than code. */
  wrap?: boolean
  /** Extra buttons shown before the copy button. */
  actions?: ReactNode
  bodyClassName?: string
}) {
  const t = useT()
  const { copied, copy } = useCopy()
  return (
    <div className={clsx('overflow-hidden rounded-lg border border-border bg-code-bg', className)}>
      <div className="flex h-8 items-center justify-between border-b border-border px-3 text-xs text-faint">
        <span className="font-mono">{label}</span>
        <div className="flex items-center gap-1">
          {actions}
          <button
            onClick={() => copy(copyText)}
            className={codeBoxAction}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? t('msg.copied') : t('msg.copy')}
          </button>
        </div>
      </div>
      <pre
        className={clsx(
          'overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed [font-variant-ligatures:none]',
          wrap && 'break-words whitespace-pre-wrap',
          bodyClassName,
        )}
        style={{ maxHeight }}
      >
        {children}
      </pre>
    </div>
  )
}

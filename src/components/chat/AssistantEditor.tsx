import { useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useAutosize } from '../../lib/hooks'
import { Button } from '../ui/Button'

/** Edits an assistant reply's Markdown source. Saving makes a new version beside the original. */
export function AssistantEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: string
  onCancel: () => void
  onSave: (text: string) => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutosize(ref, text, Infinity)
  const changed = text !== initial && text.trim().length > 0

  return (
    <div className="anim-fade rounded-xl border border-border-strong bg-surface shadow-composer">
      <textarea
        ref={ref}
        value={text}
        autoFocus
        spellCheck={false}
        placeholder={t('msg.editReplyPlaceholder')}
        onFocus={(e) => e.currentTarget.setSelectionRange(0, 0)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            if (changed) onSave(text)
          }
        }}
        className="block w-full resize-none overflow-hidden bg-transparent px-4 py-3 font-mono text-[13.5px] leading-relaxed [font-variant-ligatures:none] [overflow-wrap:anywhere] placeholder:font-sans placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center gap-2 border-t border-border py-2.5 pr-2.5 pl-4">
        <span className="min-w-0 flex-1 truncate text-xs text-faint">{t('msg.editReplyHint')}</span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" variant="primary" onClick={() => onSave(text)} disabled={!changed}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

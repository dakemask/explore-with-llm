import { BookOpen, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useT } from '../../i18n'
import { useCopy } from '../../lib/hooks'
import { paramsDoc, paramsExample } from '../../lib/paramsDoc'
import { useSettings } from '../../store/settings'
import { Markdown } from '../chat/Markdown'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Label, Textarea } from '../ui/Field'

/** One model's parameter config as JSON text; it's checked when the model's config is saved. */
export function ParamsEditor({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const [docOpen, setDocOpen] = useState(false)

  return (
    <div>
      <Label
        help={t('provider.paramsHint')}
        action={
          <Button size="sm" variant="ghost" onClick={() => setDocOpen(true)}>
            <BookOpen size={13} />
            {t('provider.paramsDoc')}
          </Button>
        }
      >
        {t('provider.params')}
      </Label>
      <Textarea
        rows={12}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={paramsExample(lang)}
        spellCheck={false}
        aria-label={t('provider.params')}
        className="font-mono text-[12.5px]"
      />
      <ParamsDocDialog open={docOpen} onOpenChange={setDocOpen} />
    </div>
  )
}

function ParamsDocDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const { copied, copy } = useCopy()
  const doc = paramsDoc(lang)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('provider.paramsDocTitle')} className="max-w-3xl">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <Markdown text={doc} className="prose-compact" />
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="primary" onClick={() => copy(doc)}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? t('msg.copied') : t('provider.copyDoc')}
        </Button>
      </div>
    </Dialog>
  )
}

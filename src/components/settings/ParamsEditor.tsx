import clsx from 'clsx'
import { BookOpen, Check, CircleAlert, CircleCheck, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Provider } from '../../db'
import { useT } from '../../i18n'
import { useCopy } from '../../lib/hooks'
import { paramsDoc, paramsExample } from '../../lib/paramsDoc'
import { modelParams } from '../../providers'
import { useSettings } from '../../store/settings'
import { Markdown } from '../chat/Markdown'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Label, Textarea } from '../ui/Field'

/** One model's parameter config: its JSON text, and whether it parses. */
export function ParamsEditor({
  provider,
  value,
  onChange,
}: {
  provider: Provider
  value: string
  onChange: (text: string) => void
}) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const [docOpen, setDocOpen] = useState(false)
  const result = useMemo(
    () => modelParams({ ...provider, modelConfigs: { m: { params: value } } }, 'm'),
    [provider, value],
  )

  return (
    <div>
      <Label
        hint={t('provider.paramsHint')}
        action={
          <Button size="sm" variant="ghost" onClick={() => setDocOpen(true)}>
            <BookOpen size={13} />
            {t('provider.paramsDoc')}
          </Button>
        }
      >
        {t('provider.params')}
      </Label>

      <div className="overflow-hidden rounded-lg border border-border transition-colors focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        <Textarea
          rows={12}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={paramsExample(lang)}
          spellCheck={false}
          aria-label={t('provider.params')}
          className="rounded-none border-0 font-mono text-[12.5px] focus:ring-0!"
        />
        <div
          className={clsx(
            'flex items-start gap-1.5 border-t border-border px-3 py-2 text-xs',
            !result.ok ? 'bg-danger-soft text-danger' : 'text-muted',
          )}
        >
          {!result.ok ? (
            <>
              <CircleAlert size={13} className="mt-px shrink-0" />
              {t(result.error.key, result.error.vars)}
            </>
          ) : !value.trim() ? (
            <span className="text-faint">{t('provider.paramsBlank')}</span>
          ) : (
            <>
              <CircleCheck size={13} className="mt-px shrink-0 text-success" />
              {t('provider.paramsOk', {
                n: result.config.params.length,
                m: result.config.items.length - result.config.params.length,
              })}
            </>
          )}
        </div>
      </div>

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

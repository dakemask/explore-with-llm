import clsx from 'clsx'
import { AlertTriangle, CircleHelp, Settings2, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Provider } from '../../db'
import { useT } from '../../i18n'
import { snap, type Param, type ParamValue, type ResolvedParam } from '../../lib/params'
import { modelParams } from '../../providers'
import { paramKey, useSettings } from '../../store/settings'
import { useUi } from '../../store/ui'
import { Segmented } from '../ui/Field'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '../ui/Popover'
import { Switch } from '../ui/Switch'

const display = (v: ParamValue | undefined) => (v === undefined ? '' : String(v))

/** The current model's adjustable request parameters: a summary button that opens their controls. */
export function ParamsControl({ provider, model }: { provider: Provider; model: string }) {
  const t = useT()
  const openSettings = useUi((s) => s.openSettings)
  const key = paramKey(provider.id, model)
  const choices = useSettings((s) => s.paramChoices[key])
  const setChoice = useSettings((s) => s.setParamChoice)
  const state = useMemo(() => modelParams(provider, model, choices), [provider, model, choices])
  const [helpOpen, setHelpOpen] = useState(false)
  const editConfig = () => openSettings('providers', { providerId: provider.id, model })

  // Nothing to adjust: a broken config or a missing required field links straight to the editor.
  if (!state.ok || state.params.length === 0) {
    const problem = !state.ok ? t('params.invalidShort') : state.missing && t('params.missing', { field: state.missing })
    if (!problem) return null
    return (
      <button
        onClick={editConfig}
        title={state.ok ? t('params.missingHint', { field: state.missing! }) : undefined}
        className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-danger transition-colors hover:bg-danger-soft"
      >
        <AlertTriangle size={14} className="shrink-0" />
        <span className="truncate">{problem}</span>
      </button>
    )
  }
  const resolved = state.params
  const missing = state.missing
  const hasSwitch = resolved.some((r) => r.param.toggle)

  return (
    <PopoverRoot onOpenChange={() => setHelpOpen(false)}>
      <PopoverTrigger asChild>
        <button
          aria-label={t('params.title')}
          className={clsx(
            'flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors',
            missing
              ? 'text-danger hover:bg-danger-soft data-[state=open]:bg-danger-soft'
              : 'text-muted hover:bg-hover hover:text-text data-[state=open]:bg-hover data-[state=open]:text-text',
          )}
        >
          {missing ? <AlertTriangle size={14} className="shrink-0" /> : <SlidersHorizontal size={14} className="shrink-0" />}
          <span className="truncate">{missing ? t('params.missing', { field: missing }) : t('params.button')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-center justify-between border-b border-border py-2 pr-2 pl-4">
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-semibold">{t('params.title')}</span>
            {hasSwitch && (
              <button
                onClick={() => setHelpOpen((o) => !o)}
                aria-label={t('params.help')}
                aria-expanded={helpOpen}
                className={clsx(
                  'flex size-6 items-center justify-center rounded-md transition-colors hover:bg-hover hover:text-text',
                  helpOpen ? 'text-text' : 'text-faint',
                )}
              >
                <CircleHelp size={14} />
              </button>
            )}
          </div>
          <button
            onClick={editConfig}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-hover hover:text-text"
          >
            <Settings2 size={13} />
            {t('params.editConfig')}
          </button>
        </div>
        {helpOpen && (
          <div className="border-b border-border bg-subtle px-4 py-2.5 text-xs leading-relaxed text-muted">
            {t('params.switchHelp')}
          </div>
        )}
        {missing && (
          <div className="flex items-start gap-1.5 border-b border-border bg-danger-soft px-4 py-2.5 text-xs leading-relaxed text-danger">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {t('params.missingHint', { field: missing })}
          </div>
        )}
        <div className="divide-y divide-border">
          {resolved.map((r) => (
            <ParamRow key={r.param.name} r={r} onChange={(c) => setChoice(key, r.param.name, c)} />
          ))}
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}

/**
 * A switch means the parameter is optional; a greyed switch, that its dependencies keep it from being sent.
 * Only a parameter that will be sent shows its value control.
 */
function ParamRow({ r, onChange }: { r: ResolvedParam; onChange: (c: { on?: boolean; value?: ParamValue }) => void }) {
  const t = useT()
  const { param: p, available, active } = r
  return (
    <div className="px-4 py-3">
      <div className="flex min-h-5 items-center gap-2">
        <span className={clsx('min-w-0 flex-1 truncate text-[13px] font-medium', !active && 'text-muted')}>{p.name}</span>
        {p.toggle ? (
          <Switch checked={active} onChange={(on) => onChange({ on })} disabled={!available} label={p.name} />
        ) : (
          p.type === 'fixed' && <span className="text-xs text-faint">{t('params.fixedOnly')}</span>
        )}
      </div>
      {!available && <div className="mt-1 text-xs text-faint">{t('params.needs', { cond: conditionText(p, t) })}</div>}
      {active && p.type === 'choice' && (
        <Segmented
          className="mt-2 flex flex-wrap"
          value={display(r.value)}
          onChange={(v) => onChange({ value: p.options.find((o) => display(o) === v) })}
          options={p.options.map((o) => ({ value: display(o), label: display(o) }))}
        />
      )}
      {active && p.type === 'range' && (
        <RangeInput param={p} value={r.value as number} onChange={(value) => onChange({ value })} />
      )}
      {active && p.type === 'fixed' && (
        <pre className="mt-1.5 truncate font-mono text-[11px] text-faint">{JSON.stringify(p.body)}</pre>
      )}
    </div>
  )
}

function RangeInput({
  param: p,
  value,
  onChange,
}: {
  param: Extract<Param, { type: 'range' }>
  value: number
  onChange: (v: number) => void
}) {
  // Typed text is kept while editing and committed (snapped onto the range) on blur / Enter.
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Number(text)
    if (text.trim() === '' || Number.isNaN(n)) setText(String(value))
    else {
      const v = snap(n, p.min, p.max, p.step)
      setText(String(v))
      if (v !== value) onChange(v)
    }
  }
  return (
    <div className="mt-2 flex items-center gap-3">
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={value}
        onChange={(e) => onChange(snap(Number(e.target.value), p.min, p.max, p.step))}
        className="h-1.5 min-w-0 flex-1 accent-accent"
      />
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="h-7 w-20 rounded-md border border-border bg-surface px-2 text-right font-mono text-xs transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
      />
    </div>
  )
}

function conditionText(p: Param, t: ReturnType<typeof useT>) {
  return p.requires
    .map((c) =>
      'on' in c
        ? t(c.on ? 'params.condOn' : 'params.condOff', { name: c.param })
        : t('params.condValue', { name: c.param, values: c.values.map(display).join(' / ') }),
    )
    .join(' · ')
}

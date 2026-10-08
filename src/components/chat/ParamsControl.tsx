import clsx from 'clsx'
import { Settings2, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Provider } from '../../db'
import { useT } from '../../i18n'
import { snap, type Param, type ParamValue, type ResolvedParam } from '../../lib/params'
import { modelParams } from '../../providers'
import { paramKey, useSettings } from '../../store/settings'
import { useUi } from '../../store/ui'
import { HelpTip } from '../ui/Button'
import { Segmented } from '../ui/Field'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '../ui/Popover'
import { Switch } from '../ui/Switch'

const display = (v: ParamValue | undefined) => (v === undefined ? '' : String(v))

/**
 * The current model's adjustable request parameters: a summary button that opens their controls.
 * `choiceKey`: where the choices are remembered (default: the model's chat choices, `paramKey`).
 */
export function ParamsControl({ provider, model, choiceKey }: { provider: Provider; model: string; choiceKey?: string }) {
  const t = useT()
  const openSettings = useUi((s) => s.openSettings)
  const key = choiceKey ?? paramKey(provider.id, model)
  const choices = useSettings((s) => s.paramChoices[key])
  const setChoice = useSettings((s) => s.setParamChoice)
  const state = useMemo(() => modelParams(provider, model, choices), [provider, model, choices])
  const editConfig = () => openSettings('providers', { providerId: provider.id, model })

  // Nothing to adjust. (Stored configs are checked when saved, so `!ok` doesn't happen.)
  if (!state.ok || state.params.length === 0) return null
  const resolved = state.params
  const hasSwitch = resolved.some((r) => r.param.toggle)

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <button
          aria-label={t('params.title')}
          className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted transition-colors hover:bg-hover hover:text-text data-[state=open]:bg-hover data-[state=open]:text-text"
        >
          <SlidersHorizontal size={14} className="shrink-0" />
          <span className="truncate">{t('params.button')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-center justify-between border-b border-border py-2 pr-2 pl-4">
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-semibold">{t('params.title')}</span>
            {hasSwitch && <HelpTip content={t('params.switchHelp')} />}
          </div>
          <button
            onClick={editConfig}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-hover hover:text-text"
          >
            <Settings2 size={13} />
            {t('params.editConfig')}
          </button>
        </div>
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
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <span className={clsx('min-w-0 truncate text-[13px] font-medium', !active && 'text-muted')}>{p.name}</span>
          {p.help && <HelpTip content={<span className="whitespace-pre-line">{p.help}</span>} />}
        </span>
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

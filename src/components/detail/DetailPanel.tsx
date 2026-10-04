import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import hljs from 'highlight.js/lib/core'
import jsonLang from 'highlight.js/lib/languages/json'
import { AlertCircle, ChevronLeft, ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, Info, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, type Attempt, type AttemptStatus, type ChatNode } from '../../db'
import { useT, type TKey } from '../../i18n'
import {
  foldHistory,
  formatMs,
  maskHeader,
  prettyJson,
  streamEvents,
  summarizeUsage,
  type TimedEvent,
} from '../../lib/attempt'
import { aggregateStream } from '../../providers'
import { useSettings } from '../../store/settings'
import { useUi } from '../../store/ui'
import { CodeBox, codeBoxAction } from '../ui/CodeBox'
import { Segmented } from '../ui/Field'
import { IconButton } from '../ui/Button'

hljs.registerLanguage('json', jsonLang)

type Tab = 'request' | 'response' | 'error'

/** Right-hand panel showing the single request behind a node: what was sent, what came back, and any error. */
export function DetailPanel({ nodeId }: { nodeId: string }) {
  const t = useT()
  const setPanel = useUi((s) => s.setPanel)
  const back = useUi((s) => (s.panel?.type === 'detail' ? s.panel.back : undefined))
  // `null` once the query has run and found nothing (node deleted), `undefined` while loading.
  const node = useLiveQuery(async () => (await db.nodes.get(nodeId)) ?? null, [nodeId])
  const close = () => setPanel(null)

  useEffect(() => {
    if (node === null) setPanel(null)
  }, [node, setPanel])

  const hasError = !!node?.attempt.error
  const [tab, setTab] = useState<Tab | null>(null)
  const current: Tab = tab ?? (hasError ? 'error' : 'response')

  return (
    <aside className="anim-drawer flex h-full w-[440px] shrink-0 flex-col border-l border-border bg-surface">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border pr-3 pl-5">
        {back ? (
          <div className="-ml-2 flex items-center gap-1">
            <IconButton label={t('detail.back')} size="sm" onClick={() => setPanel(back)}>
              <ChevronLeft size={16} />
            </IconButton>
            <h2 className="text-[15px] font-semibold">{t('detail.title')}</h2>
          </div>
        ) : (
          <h2 className="text-[15px] font-semibold">{t('detail.title')}</h2>
        )}
        <IconButton label={t('common.close')} size="sm" onClick={close}>
          <X size={16} />
        </IconButton>
      </header>
      {node && (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-8">
          <Summary attempt={node.attempt} />
          <div className="mt-5 mb-4">
            <Segmented<Tab>
              value={current}
              onChange={setTab}
              options={[
                { value: 'request', label: t('detail.tab.request') },
                { value: 'response', label: t('detail.tab.response') },
                ...(hasError ? [{ value: 'error' as const, label: t('detail.tab.error') }] : []),
              ]}
            />
          </div>
          <div key={current} className="anim-fade">
            {current === 'request' && <RequestTab attempt={node.attempt} />}
            {current === 'response' && <ResponseTab node={node} />}
            {current === 'error' && <ErrorTab attempt={node.attempt} />}
          </div>
        </div>
      )}
    </aside>
  )
}

// ---------- Summary ----------

const statusStyle: Record<AttemptStatus, string> = {
  streaming: 'bg-accent-soft text-accent',
  done: 'bg-success-soft text-success',
  error: 'bg-danger-soft text-danger',
  aborted: 'bg-subtle text-muted',
}

function Summary({ attempt: a }: { attempt: Attempt }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const streaming = a.status === 'streaming'
  const now = useNow(streaming)
  const usage = summarizeUsage(a.usage)
  const end = a.finishedAt ?? (streaming ? now : undefined)

  const tokenExtras = [
    usage?.reasoning != null && t('detail.reasoningTokens', { n: usage.reasoning }),
    usage?.cached != null && t('detail.cachedTokens', { n: usage.cached }),
  ].filter(Boolean)

  const rows: [TKey, ReactNode][] = [
    ['detail.startedAt', new Date(a.startedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })],
    ['detail.duration', end != null ? formatMs(end - a.startedAt) : '—'],
    ['detail.ttft', a.firstTokenAt != null ? formatMs(a.firstTokenAt - a.startedAt) : '—'],
    ['detail.finishReason', a.finishReason ? <code className="font-mono text-[12px]">{a.finishReason}</code> : '—'],
    [
      'detail.tokens',
      usage ? (
        <>
          {t('detail.tokensValue', { in: usage.input ?? '?', out: usage.output ?? '?' })}
          {tokenExtras.length > 0 && <span className="text-faint"> ({tokenExtras.join(' · ')})</span>}
        </>
      ) : (
        '—'
      ),
    ],
  ]

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{a.model}</div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {a.providerName} · {t(`protocol.${a.protocol}`)}
          </div>
        </div>
        <span
          className={clsx(
            'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            statusStyle[a.status],
          )}
        >
          <span className={clsx('size-1.5 rounded-full bg-current', streaming && 'animate-pulse')} />
          {t(`detail.status.${a.status}`)}
        </span>
      </div>
      <dl className="mt-3.5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 border-t border-border pt-3.5 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{t(k)}</dt>
            <dd className="min-w-0 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Current time, re-read every 100 ms while `active`, for live elapsed timers. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [active])
  return now
}

// ---------- Tabs ----------

function RequestTab({ attempt: a }: { attempt: Attempt }) {
  const t = useT()
  const [reveal, setReveal] = useState(false)
  const [unfolded, setUnfolded] = useState(false)
  const headers = a.requestHeaders
  const body = useMemo(() => (a.requestBody == null ? '' : JSON.stringify(a.requestBody, null, 2)), [a.requestBody])
  const fold = useMemo(() => foldHistory(a.requestBody), [a.requestBody])

  if (!a.url) return <Note>{t('detail.notSent')}</Note>
  const entries = Object.entries(headers ?? {})
  const hasSecret = entries.some(([k, v]) => maskHeader(k, v) !== v)
  const headText = [`POST ${a.url}`, ...entries.map(([k, v]) => `${k}: ${v}`)].join('\n')

  return (
    <div className="space-y-5">
      <Section title={t('detail.requestHead')}>
        <CodeBox
          label="http"
          copyText={headText}
          wrap
          actions={
            hasSecret && (
              <button className={codeBoxAction} onClick={() => setReveal(!reveal)}>
                {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
                {reveal ? t('detail.hideKey') : t('detail.showKey')}
              </button>
            )
          }
        >
          <span className="font-semibold text-accent">POST</span> <span className="break-all">{a.url}</span>
          {entries.map(([k, v]) => (
            <Fragment key={k}>
              {'\n'}
              <span className="text-muted">{k}:</span> <span className="break-all">{reveal ? v : maskHeader(k, v)}</span>
            </Fragment>
          ))}
        </CodeBox>
        {!headers && <Note className="mt-2">{t('detail.legacy')}</Note>}
      </Section>
      <Section title={t('detail.requestBody')}>
        <CodeBox
          label="json"
          copyText={body}
          maxHeight="60vh"
          wrap
          actions={
            fold && (
              <button className={codeBoxAction} onClick={() => setUnfolded(!unfolded)}>
                {unfolded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                {unfolded ? t('detail.collapseHistory') : t('detail.expandHistory')}
              </button>
            )
          }
        >
          {fold && !unfolded ? (
            <>
              <Json text={fold.before} />
              {fold.indent}
              <button
                onClick={() => setUnfolded(true)}
                className="rounded bg-active px-1.5 font-sans text-[12px] text-muted transition-colors hover:text-text"
              >
                {t('detail.historyFolded', { n: fold.hidden })}
              </button>
              {'\n'}
              <Json text={fold.after} />
            </>
          ) : (
            <Json text={body} />
          )}
        </CodeBox>
      </Section>
    </div>
  )
}

type StreamView = 'events' | 'merged' | 'raw'
/** Remembered across panel openings within a session. */
let lastStreamView: StreamView = 'merged'

function ResponseTab({ node }: { node: ChatNode }) {
  const t = useT()
  const a = node.attempt
  const [view, setViewState] = useState<StreamView>(lastStreamView)
  const setView = (v: StreamView) => setViewState((lastStreamView = v))

  const events = useMemo(() => (a.rawChunks ? streamEvents(a.rawChunks) : null), [a.rawChunks])
  const merged = useMemo(() => {
    if (!events) return ''
    try {
      const payloads = events.filter((e) => e.json !== undefined).map((e) => e.json)
      return JSON.stringify(aggregateStream(a.protocol, payloads), null, 2)
    } catch (e) {
      return String(e)
    }
  }, [events, a.protocol])
  const raw = useMemo(() => a.rawChunks?.map((c) => c.text).join('') ?? '', [a.rawChunks])

  const r = a.response
  const headText = r
    ? [`HTTP ${r.status} ${r.statusText}`.trim(), ...Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`)].join('\n')
    : ''
  const errBody = !events && a.error?.body
  const prettyErr = errBody ? prettyJson(errBody) : null
  const legacy = !r && !events && a.status !== 'streaming' && a.error?.code !== 'network'

  return (
    <div className="space-y-5">
      {node.assistant.edited && <Note>{t('detail.editedNote')}</Note>}
      {legacy && <Note>{t('detail.legacy')}</Note>}
      {r && (
        <Section title={t('detail.responseHead')}>
          <CodeBox label="http" copyText={headText} wrap>
            <span className={clsx('font-semibold', r.status < 400 ? 'text-success' : 'text-danger')}>
              HTTP {r.status} {r.statusText}
            </span>
            {Object.entries(r.headers).map(([k, v]) => (
              <Fragment key={k}>
                {'\n'}
                <span className="text-muted">{k}:</span> <span className="break-all">{v}</span>
              </Fragment>
            ))}
          </CodeBox>
          <p className="mt-1.5 text-xs text-faint">{t('detail.corsNote')}</p>
        </Section>
      )}
      {!r && a.error?.code === 'network' && <Note>{t('detail.noResponse')}</Note>}

      {a.status === 'streaming' ? (
        <Note>{t('detail.streamingNote')}</Note>
      ) : events ? (
        <Section title={t('detail.responseBody')}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Segmented<StreamView>
              value={view}
              onChange={setView}
              options={[
                { value: 'events', label: t('detail.view.events') },
                { value: 'merged', label: t('detail.view.merged') },
                { value: 'raw', label: t('detail.view.raw') },
              ]}
            />
            <span className="text-xs text-faint tabular-nums">{t('detail.eventsCount', { n: events.length })}</span>
          </div>
          <p className="mb-2.5 text-xs text-faint">{t(`detail.viewHint.${view}`)}</p>
          {view === 'events' && <EventList events={events} raw={raw} />}
          {view === 'merged' && (
            <CodeBox label="json" copyText={merged} maxHeight="60vh" wrap>
              <Json text={merged} />
            </CodeBox>
          )}
          {view === 'raw' && (
            <CodeBox label="text/event-stream" copyText={raw} maxHeight="60vh" wrap>
              {raw}
            </CodeBox>
          )}
        </Section>
      ) : errBody ? (
        <Section title={t('detail.responseBody')}>
          <CodeBox label={prettyErr ? 'json' : 'text'} copyText={errBody} maxHeight="60vh" wrap>
            {prettyErr ? <Json text={prettyErr} /> : errBody}
          </CodeBox>
        </Section>
      ) : legacy && a.rawText ? (
        <Section title={t('detail.responseBody')}>
          <CodeBox label="text" copyText={a.rawText} maxHeight="60vh" wrap>
            {a.rawText}
          </CodeBox>
        </Section>
      ) : null}
    </div>
  )
}

const EVENT_PAGE = 200

/**
 * Single-line JSON with spaces between tokens, so long lines wrap between tokens rather than inside words.
 * Only structural newlines exist in the output (string contents escape theirs), so values are untouched.
 */
function oneLineJson(v: unknown) {
  return JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ')
}

function EventList({ events, raw }: { events: TimedEvent[]; raw: string }) {
  const t = useT()
  const [all, setAll] = useState(false)
  const shown = all ? events : events.slice(0, EVENT_PAGE)
  return (
    <CodeBox label="sse" copyText={raw} maxHeight="60vh" wrap bodyClassName="!p-0 text-[12px]">
      {shown.map((e, i) => (
        <span key={i} className="flex gap-3 border-b border-border px-3 py-1.5 last:border-b-0">
          <span className="w-12 shrink-0 text-right text-faint tabular-nums">+{e.t}</span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {e.event && <span className="text-muted">event: {e.event} </span>}
            {e.json !== undefined ? <Json text={oneLineJson(e.json)} /> : e.data}
          </span>
        </span>
      ))}
      {!all && events.length > EVENT_PAGE && (
        <span className="flex justify-center p-2">
          <button onClick={() => setAll(true)} className="font-sans text-xs text-accent hover:text-accent-hover">
            {t('detail.showAll', { n: events.length })}
          </button>
        </span>
      )}
    </CodeBox>
  )
}

function ErrorTab({ attempt: a }: { attempt: Attempt }) {
  const t = useT()
  const err = a.error
  if (!err) return null
  const pretty = err.body ? prettyJson(err.body) : null
  return (
    <div className="space-y-5">
      <div className="flex gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13px]">
        <AlertCircle size={16} className="mt-px shrink-0 text-danger" />
        <div className="min-w-0">
          <div className="font-medium text-danger">
            {t('msg.error')}
            {err.status ? ` · HTTP ${err.status}` : ''}
          </div>
          <div className="mt-0.5 break-words text-muted">{err.message}</div>
          {err.code === 'network' && <div className="mt-1.5 break-words text-muted">{t('error.network')}</div>}
        </div>
      </div>
      {err.body && (
        <Section title={t('detail.errorBody')}>
          <CodeBox label={pretty ? 'json' : 'text'} copyText={err.body} maxHeight="420px" wrap>
            {pretty ? <Json text={pretty} /> : err.body}
          </CodeBox>
        </Section>
      )}
    </div>
  )
}

// ---------- Pieces ----------

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium text-muted">{title}</h3>
      {children}
    </section>
  )
}

function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex gap-2 rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-muted', className)}>
      <Info size={15} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

function Json({ text }: { text: string }) {
  const html = useMemo(() => hljs.highlight(text, { language: 'json' }).value, [text])
  return <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
}

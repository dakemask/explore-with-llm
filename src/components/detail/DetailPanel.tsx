import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import hljs from 'highlight.js/lib/core'
import jsonLang from 'highlight.js/lib/languages/json'
import { AlertCircle, Info, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, type Attempt, type AttemptStatus, type ChatNode } from '../../db'
import { useT, type TKey } from '../../i18n'
import { formatMs, prettyJson, requestMessages, summarizeUsage, type DisplayMessage } from '../../lib/attempt'
import { useSettings } from '../../store/settings'
import { useUi } from '../../store/ui'
import { CodeBox } from '../ui/CodeBox'
import { Segmented } from '../ui/Field'
import { IconButton } from '../ui/Button'

hljs.registerLanguage('json', jsonLang)

type Tab = 'request' | 'response' | 'error'

/** Right-hand panel showing the single request behind a node: what was sent, what came back, and any error. */
export function DetailPanel({ nodeId }: { nodeId: string }) {
  const t = useT()
  const setPanel = useUi((s) => s.setPanel)
  const live = useUi((s) => s.live[nodeId])
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
        <h2 className="text-[15px] font-semibold">{t('detail.title')}</h2>
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
            {current === 'response' && <ResponseTab node={node} liveText={live?.content} liveReasoning={live?.reasoning} />}
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
  const messages = useMemo(() => requestMessages(a.requestBody), [a.requestBody])
  const body = useMemo(() => (a.requestBody == null ? '' : JSON.stringify(a.requestBody, null, 2)), [a.requestBody])

  if (!a.url) return <Note>{t('detail.notSent')}</Note>
  return (
    <div className="space-y-5">
      <Section title={t('detail.endpoint')}>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-code-bg px-3 py-2 font-mono text-[12.5px]">
          <span className="font-semibold text-accent">POST</span>
          <span className="min-w-0 break-all">{a.url}</span>
        </div>
      </Section>
      {messages && (
        <Section title={t('detail.messages', { n: messages.length })}>
          <div className="space-y-2">
            {messages.map((m, i) => (
              <MessageCard key={i} message={m} />
            ))}
          </div>
        </Section>
      )}
      <Section title={t('detail.rawBody')}>
        <CodeBox label="json" copyText={body} maxHeight="420px" wrap>
          <Json text={body} />
        </CodeBox>
      </Section>
    </div>
  )
}

function ResponseTab({
  node,
  liveText,
  liveReasoning,
}: {
  node: ChatNode
  liveText?: string
  liveReasoning?: string
}) {
  const t = useT()
  const a = node.attempt
  const text = liveText ?? a.rawText
  const reasoning = liveReasoning ?? a.rawReasoning ?? ''
  const usage = useMemo(() => (a.usage ? JSON.stringify(a.usage, null, 2) : ''), [a.usage])

  if (!text && !reasoning && !usage) {
    return a.status === 'streaming' ? null : <Note>{t('detail.noOutput')}</Note>
  }
  return (
    <div className="space-y-5">
      {node.assistant.edited && <Note>{t('detail.editedNote')}</Note>}
      {reasoning && (
        <Section title={t('detail.rawReasoning')}>
          <CodeBox label="text" copyText={reasoning} maxHeight="240px" wrap>
            {reasoning}
          </CodeBox>
        </Section>
      )}
      {text && (
        <Section title={t('detail.rawText')}>
          <CodeBox label="markdown" copyText={text} maxHeight="60vh" wrap>
            {text}
          </CodeBox>
        </Section>
      )}
      {usage && (
        <Section title={t('detail.usage')}>
          <CodeBox label="json" copyText={usage} wrap>
            <Json text={usage} />
          </CodeBox>
        </Section>
      )}
    </div>
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

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-muted">
      <Info size={15} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

const CLAMP_CHARS = 280
const CLAMP_LINES = 6

function MessageCard({ message }: { message: DisplayMessage }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const long = message.text.length > CLAMP_CHARS || message.text.split('\n').length > CLAMP_LINES
  const roleKey = `detail.role.${message.role}` as TKey
  const role = ['system', 'user', 'assistant'].includes(message.role) ? t(roleKey) : message.role
  return (
    <div
      className={clsx(
        'rounded-lg border border-border px-3 py-2.5',
        message.role === 'user' ? 'bg-user-bubble' : 'bg-surface',
      )}
    >
      <div className="mb-1 text-[11px] font-medium tracking-wide text-faint">{role}</div>
      <div
        className={clsx('text-[13px] leading-relaxed break-words whitespace-pre-wrap', long && !expanded && 'line-clamp-6')}
      >
        {message.text}
      </div>
      {long && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-accent transition-colors hover:text-accent-hover"
        >
          {expanded ? t('detail.showLess') : t('detail.showMore')}
        </button>
      )}
    </div>
  )
}

function Json({ text }: { text: string }) {
  const html = useMemo(() => hljs.highlight(text, { language: 'json' }).value, [text])
  return <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
}

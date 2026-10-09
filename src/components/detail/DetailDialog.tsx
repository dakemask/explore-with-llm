import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import hljs from 'highlight.js/lib/core'
import jsonLang from 'highlight.js/lib/languages/json'
import { AlertCircle, Check, ChevronsDownUp, Copy, ChevronsUpDown, Download, Eye, EyeOff, Info } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, type Attempt, type AttemptStatus, type ChatNode } from '../../db'
import { useT, type TKey } from '../../i18n'
import { foldHistory, formatMs, maskHeader, prettyJson, summarizeUsage } from '../../lib/attempt'
import { replyVersions, selectBranch, type ReplyVersion } from '../../lib/chat'
import { readRequest, responseZip, type RequestRecord } from '../../lib/records'
import { download } from '../../lib/transfer'
import { forkKey } from '../../lib/tree'
import { useCopy } from '../../lib/hooks'
import { Markdown } from '../chat/Markdown'
import { useSettings } from '../../store/settings'
import { useUi } from '../../store/ui'
import { CodeBox, codeBoxAction } from '../ui/CodeBox'
import { Segmented } from '../ui/Field'
import { Button, HelpTip } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { notifyError } from '../ui/Toast'

hljs.registerLanguage('json', jsonLang)

type Tab = 'request' | 'response' | 'error' | 'versions'

/** Dialog showing the single request behind a node: what was sent, what came back, and any error. */
export function DetailDialog({ nodeId }: { nodeId: string }) {
  const t = useT()
  const setPanel = useUi((s) => s.setPanel)
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
    <Dialog open onOpenChange={(open) => !open && close()} title={t('detail.title')} className="h-[85vh] max-w-3xl">
      {node && (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-8">
          {node.edit && <EditedNote node={node} />}
          <Summary attempt={node.attempt} />
          <div className="mt-5 mb-4">
            <Segmented<Tab>
              value={current}
              onChange={setTab}
              options={[
                { value: 'request', label: t('detail.tab.request') },
                { value: 'response', label: t('detail.tab.response') },
                ...(hasError ? [{ value: 'error' as const, label: t('detail.tab.error') }] : []),
                ...(node.edit ? [{ value: 'versions' as const, label: t('detail.tab.versions') }] : []),
              ]}
            />
          </div>
          <div key={current} className="anim-fade">
            {current === 'request' && <RequestTab node={node} />}
            {current === 'response' && <ResponseTab node={node} />}
            {current === 'error' && <ErrorTab attempt={node.attempt} />}
            {current === 'versions' && <VersionsTab node={node} />}
          </div>
        </div>
      )}
    </Dialog>
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

/**
 * The request `node` sent, read from its record (`lib/records.ts`) when shown. `undefined` while reading,
 * null when none is stored.
 */
function useRequest(node: ChatNode): RequestRecord | null | undefined {
  const row = useLiveQuery(async () => (await db.requests.get(node.id)) ?? null, [node.id])
  const [request, setRequest] = useState<{ row: unknown; value: RequestRecord | null }>()
  useEffect(() => {
    if (row === undefined) return
    let live = true
    if (row === null) setRequest({ row, value: null })
    else
      readRequest(row, node).then(
        (value) => live && setRequest({ row, value }),
        (e) => {
          console.error(e)
          if (live) setRequest({ row, value: null })
        },
      )
    return () => {
      live = false
    }
  }, [row, node])
  return request && request.row === row ? request.value : undefined
}

function RequestTab({ node }: { node: ChatNode }) {
  const t = useT()
  const a = node.attempt
  const [reveal, setReveal] = useState(false)
  const [unfolded, setUnfolded] = useState(false)
  const request = useRequest(node)
  const headers = request?.headers
  const body = useMemo(() => (request?.body == null ? '' : JSON.stringify(request.body, null, 2)), [request])
  const fold = useMemo(() => foldHistory(request?.body), [request])

  if (!a.url) return <Note>{t('detail.notSent')}</Note>
  if (request === undefined) return null
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

function ResponseTab({ node }: { node: ChatNode }) {
  const t = useT()
  const a = node.attempt
  const r = a.response
  const headText = r
    ? [`HTTP ${r.status} ${r.statusText}`.trim(), ...Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`)].join('\n')
    : ''
  const streamed = !!a.responseSize
  const errBody = !streamed && a.error?.body
  const prettyErr = errBody ? prettyJson(errBody) : null
  const legacy = !r && !streamed && a.status !== 'streaming' && a.error?.code !== 'network'

  return (
    <div className="space-y-5">
      {legacy && <Note>{t('detail.legacy')}</Note>}
      {r && (
        <Section title={t('detail.responseHead')} help={t('detail.corsNote')}>
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
        </Section>
      )}
      {!r && a.error?.code === 'network' && <Note>{t('detail.noResponse')}</Note>}

      {a.status === 'streaming' ? (
        <Note>{t('detail.streamingNote')}</Note>
      ) : streamed ? (
        <Section title={t('detail.responseBody')} help={t('detail.downloadHint')}>
          <DownloadButton node={node} />
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

/** Downloads the raw response as a .zip (`responseZip`). */
function DownloadButton({ node }: { node: ChatNode }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const size = node.attempt.responseSize ?? 0
  const save = async () => {
    setBusy(true)
    try {
      const zip = await responseZip(node)
      if (!zip) throw new Error(t('detail.downloadMissing'))
      download(zip.name, zip.blob)
    } catch (e) {
      notifyError(t('detail.downloadFailed'), (e as Error)?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button onClick={save} disabled={busy} className="gap-1.5">
      <Download size={14} />
      {t('detail.download')}
      <span className="font-normal text-faint tabular-nums">
        {size < 1024 ? `${size} B` : `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB`}
      </span>
    </Button>
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
          {err.code && <div className="mt-1.5 break-words text-muted">{t(`error.${err.code}`)}</div>}
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

function Section({ title, help, children }: { title: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1 text-xs font-medium text-muted">
        {title}
        {help && <HelpTip content={help} />}
      </h3>
      {children}
    </section>
  )
}

function VersionsTab({ node }: { node: ChatNode }) {
  const t = useT()
  const versions = replyVersions(node)
  const edits = versions.length - 1
  return (
    <div className="space-y-4">
      <Note>{t('detail.versionsNote', { n: edits })}</Note>
      {versions.map((v, i) => (
        <VersionCard
          key={i}
          label={
            v.kind === 'current'
              ? t('detail.version.current')
              : v.kind === 'original'
                ? t('detail.version.original')
                : t('detail.version.edit', { n: versions.length - 1 - i })
          }
          version={v}
        />
      ))}
    </div>
  )
}

function VersionCard({ label, version }: { label: string; version: ReplyVersion }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const { copied, copy } = useCopy()
  const current = version.kind === 'current'
  return (
    <div className={clsx('overflow-hidden rounded-lg border', current ? 'border-border-strong' : 'border-border')}>
      <div className="flex h-9 items-center gap-2 border-b border-border bg-bg px-3 text-xs">
        <span className={clsx('font-medium', current ? 'text-accent' : 'text-text')}>{label}</span>
        <span className="flex-1 text-faint">
          {new Date(version.at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })}
        </span>
        <button onClick={() => copy(version.content)} className={clsx(codeBoxAction, 'text-faint')}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t('msg.copied') : t('msg.copy')}
        </button>
      </div>
      <div className="px-4 py-3">
        {version.content ? (
          <Markdown text={version.content} className="prose-compact" />
        ) : (
          <p className="text-[13px] text-faint">{t('detail.version.empty')}</p>
        )}
      </div>
    </div>
  )
}

/** An edited version shows its source's exchange; says so, and leads back to the source. */
function EditedNote({ node }: { node: ChatNode }) {
  const t = useT()
  const source = useLiveQuery(() => db.nodes.get(node.edit!.from), [node.edit!.from])
  const show = async () => {
    if (!source) return
    await selectBranch(source.conversationId, forkKey(source), source.id)
    useUi.getState().setPanel({ type: 'detail', nodeId: source.id })
  }
  return (
    <Note className="mb-4">
      {t('detail.editedNote')}
      {source && (
        <button onClick={show} className="mt-1.5 block font-medium text-accent hover:underline">
          {t('detail.showSource')}
        </button>
      )}
    </Note>
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

import { db, type ChatNode, type Provider } from '../db'
import { translate, type Lang } from '../i18n'
import { modelParams, prepareChat, ProviderError, sendChat } from '../providers'
import { namingParamKey, useSettings } from '../store/settings'
import { useUi } from '../store/ui'
import { notifyError } from '../components/ui/Toast'
import { splitThink } from './reasoning'
import { pathTo } from './tree'

/**
 * Automatic titles for conversations and side questions, made by the naming model chosen in settings.
 * A conversation is named from its first message and reply, a side question from the main-line turns
 * it was asked under (at most `CONTEXT_TURNS`) plus its own first message and reply.
 * The prompt is Chatbox's (`nameConversation`), adapted for side questions.
 */

const CONTEXT_TURNS = 2
/** Each message is cut to this many characters (Chatbox: 100; longer here so a quoted side question keeps its question). */
const MAX_CHARS = 200

/** The naming model, if one is chosen and still exists. */
export function namingModel(providers: Provider[]): { provider: Provider; model: string } | undefined {
  const chosen = useSettings.getState().namingModel
  const provider = chosen && providers.find((p) => p.id === chosen.providerId)
  if (!provider || !provider.models.includes(chosen.model)) return undefined
  return { provider, model: chosen.model }
}

/** Key of the title `node` would get named for: its conversation (first main message) or its side thread (root). */
export function titleKey(node: ChatNode): string | undefined {
  if (node.kind === 'main' && node.parentId === null) return node.conversationId
  if (node.anchor && node.thread) return node.thread
  return undefined
}

/** Whether `node`'s reply should name its conversation / side thread, given the current state. */
export async function needsName(node: ChatNode): Promise<boolean> {
  const key = titleKey(node)
  if (!key) return false
  const conv = await db.conversations.get(node.conversationId)
  if (!conv) return false
  return key === conv.id ? !conv.named : !conv.threadTitles?.[key]
}

/** Called once `node`'s reply has finished (any outcome). Names its conversation / thread if it is the one to. */
export async function afterReply(nodeId: string) {
  const node = await db.nodes.get(nodeId)
  const key = node && titleKey(node)
  if (!node || !key) return
  const setNaming = useUi.getState().setNaming
  const lang = useSettings.getState().lang
  try {
    const target = namingModel(await db.providers.toArray())
    if (node.attempt.status !== 'done' || !target || !(await needsName(node))) return
    setNaming(key, true)
    const all = await db.nodes.where('conversationId').equals(node.conversationId).toArray()
    const prompt = key === node.conversationId ? conversationPrompt(node, lang) : sidePrompt(node, all, lang)
    let title: string
    try {
      title = await requestName(target.provider, target.model, prompt)
    } catch (e) {
      notifyError(translate(lang, 'naming.failed'), [
        `${target.model} · ${target.provider.name}`,
        e instanceof Error ? e.message : String(e),
      ])
      return
    }
    // The user may have renamed it, or deleted it, while the name was on its way.
    const conv = await db.conversations.get(node.conversationId)
    if (!conv) return
    if (key === conv.id) {
      if (!conv.named) await db.conversations.update(conv.id, { title, named: true })
    } else if (await db.nodes.get(node.id)) {
      await db.conversations.update(conv.id, { threadTitles: { ...conv.threadTitles, [key]: title } })
    }
  } finally {
    setNaming(key, false)
    // No name from the model (none chosen, the reply failed, naming failed): the first line of the message.
    const conv = await db.conversations.get(node.conversationId)
    if (key === node.conversationId && conv && !conv.title)
      await db.conversations.update(conv.id, { title: fallbackTitle(node.user.text, node.user.images?.length ?? 0, lang) })
  }
}

/** Title used until (or instead of) a model-made one: the message's first line, or "Image" for an image-only one. */
export function fallbackTitle(text: string, images: number, lang: Lang) {
  const line = text.trim().split('\n')[0]
  if (line) return line.length > 40 ? line.slice(0, 40) + '…' : line
  return images ? translate(lang, 'chat.imageTitle') : ''
}

/** A side question's title until the model names it: its first line that isn't part of the quote, else the quoted text. */
export function sideFallbackTitle(root: ChatNode | undefined, anchorText: string) {
  const own = root?.user.text.split('\n').find((l) => l.trim() && !l.trimStart().startsWith('>'))?.trim()
  return own || anchorText.replace(/\s+/g, ' ').trim()
}

const language = (lang: Lang) => (lang === 'zh' ? '简体中文' : 'English')

function messageTexts(n: ChatNode, lang: Lang): string[] {
  const user = n.user.text.trim() || translate(lang, 'image.only')
  return [user, n.assistant.content].map((s) => s.slice(0, MAX_CHARS))
}

const format = (msgs: string[]) => msgs.join('\n\n---------\n\n')

function conversationPrompt(node: ChatNode, lang: Lang) {
  const l = language(lang)
  return `Based on the chat history, give this conversation a name.
Keep it short - 10 words max, no quotes.
Use ${l}.
Just provide the name, nothing else.

Here's the conversation:

\`\`\`
${format(messageTexts(node, lang))}
\`\`\`

Name this conversation in 10 words or less.
Use ${l}.
Only give the name, nothing else.

The name is:`
}

function sidePrompt(node: ChatNode, all: ChatNode[], lang: Lang) {
  const l = language(lang)
  const above = node.parentId ? pathTo(all, node.parentId).slice(-CONTEXT_TURNS) : []
  const context = above.length
    ? `Here's the earlier conversation, for context only:

\`\`\`
${format(above.flatMap((n) => messageTexts(n, lang)))}
\`\`\`

`
    : ''
  return `Based on the chat history, give the follow-up question at the end a name.
Keep it short - 10 words max, no quotes.
Use ${l}.
Just provide the name, nothing else.

${context}Here's the follow-up question and its answer:

\`\`\`
${format(messageTexts(node, lang))}
\`\`\`

Name this follow-up question in 10 words or less.
Use ${l}.
Only give the name, nothing else.

The name is:`
}

/** Sends `prompt` to the naming model (its parameter config, with the choices made for naming) and returns the cleaned-up name. */
async function requestName(provider: Provider, model: string, prompt: string): Promise<string> {
  const { lang, paramChoices } = useSettings.getState()
  const params = modelParams(provider, model, paramChoices[namingParamKey(provider.id, model)])
  if (!params.ok) throw new ProviderError(translate(lang, 'params.invalid'))
  const req = prepareChat(provider, model, [{ role: 'user', content: prompt }], params.body)
  const events = await sendChat(provider, req, new AbortController().signal)
  let text = ''
  for await (const ev of events) if (ev.type === 'text') text += ev.delta
  const name = cleanName(text)
  if (!name) throw new ProviderError(translate(lang, 'error.empty'))
  return name
}

/** The first non-empty line of the reply, without `<think>` blocks, a "name:" lead-in, quotes or a final period. */
export function cleanName(text: string): string {
  const line = splitThink(text).content.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  const name = line
    .replace(/^(\*\*)?(the name is|name|title|标题|名称)\s*[:：]\s*/i, '')
    .replace(/\*\*/g, '')
    .replace(/[。.]$/, '')
    .replace(/^["'“”‘’「」『』《》]+|["'“”‘’「」『』《》]+$/g, '')
    .replace(/[。.]$/, '')
    .trim()
  return name.length > 60 ? name.slice(0, 60) + '…' : name
}

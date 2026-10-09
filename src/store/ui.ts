import { create } from 'zustand'
import type { SideAnchor } from '../db'
import type { ImageFile } from '../lib/images'

/** Live text of in-flight requests, kept in memory so streaming doesn't hammer IndexedDB. */
export interface LiveStream {
  content: string
  reasoning: string
}

/** The request detail dialog of a node. */
export type Panel = { type: 'detail'; nodeId: string }

/**
 * A side question not sent yet (its thread has no node): asked from main node `nodeId` about `anchor`.
 * `text` / `images` are what its composer held when its card last closed; `prefill` is the quote it
 * started with. A draft with nothing beyond the prefill is dropped once its card isn't expanded.
 */
export interface SideDraft {
  conversationId: string
  nodeId: string
  anchor: SideAnchor
  prefill: string
  text: string
  images: ImageFile[]
}

export const isEmptyDraft = (d: SideDraft) =>
  d.images.length === 0 && (!d.text.trim() || d.text.trim() === d.prefill.trim())

/** What the main input box held when its conversation was left (`NEW_CHAT` = the not yet created one). */
export interface ComposerDraft {
  text: string
  images: ImageFile[]
}
export const NEW_CHAT = 'new'

interface UiState {
  conversationId: string | null
  panel: Panel | null
  /** The thread (or draft) whose card is expanded in the side-question column. */
  expanded: string | null
  /** Unsent side questions by thread id (kept per conversation while the app runs). */
  drafts: Record<string, SideDraft>
  /** Unsent text in the main input box by conversation id (kept while the app runs). */
  composerDrafts: Record<string, ComposerDraft>
  /**
   * The system message for a first turn not sent yet, by conversation id (`NEW_CHAT` = the not yet created
   * one), once the user changed it; otherwise it starts from the settings' default.
   */
  systemDrafts: Record<string, string>
  settingsOpen: boolean
  settingsTab: 'providers' | 'general'
  /** Provider (and model) the providers tab should show when it opens. */
  settingsFocus: { providerId: string; model?: string } | null
  live: Record<string, LiveStream>
  /** Conversations / side threads (by id) waiting for their automatic title: the reply or the naming request is running. */
  naming: Record<string, true>
  /** Side threads fading out before they turn into branches (their card, bar and highlight). */
  leaving: Record<string, true>
  /** Main nodes that just became branches: their switcher dot plays its arrival animation. */
  newBranches: Record<string, true>
  /**
   * Fork selections just made (fork key → node id), shown at once: `useConversationData` lays them over the
   * stored ones until its next read has them (the write and the re-read took ~50 ms before a switch began).
   */
  picked: { conversationId: string; selection: Record<string, string> } | null
  /**
   * Switches conversation — the only way to. Clears what belongs to the conversation on screen: the detail
   * dialog and the expanded card here, the tree map and the chat's other transient state in `ChatView`
   * (reset as `conversationId` changes). Kept per conversation: side-question drafts, the input box's text.
   */
  setConversation: (id: string | null) => void
  openSettings: (tab?: UiState['settingsTab'], focus?: UiState['settingsFocus']) => void
  closeSettings: () => void
  setLive: (nodeId: string, live: LiveStream | null) => void
  setPanel: (panel: Panel | null) => void
  /** Expands one card (null: none). A draft's card saves (or drops) it as it closes, see `saveDraft`. */
  expand: (thread: string | null) => void
  /** Starts a side question about `anchor` and expands its card. */
  startDraft: (thread: string, draft: Omit<SideDraft, 'text' | 'images'>) => void
  /** Keeps what a draft's composer holds as its card closes (an empty draft that isn't expanded is dropped). */
  saveDraft: (thread: string, text: string, images: ImageFile[]) => void
  dropDraft: (thread: string) => void
  /** Keeps what the main input box holds as its conversation is left (nothing typed: forgets it). */
  saveComposerDraft: (key: string, text: string, images: ImageFile[]) => void
  /** Sets (text) or forgets (null) the system message for `key`'s first turn. */
  setSystemDraft: (key: string, text: string | null) => void
  setNaming: (key: string, on: boolean) => void
  setLeaving: (thread: string, on: boolean) => void
  /** Marks nodes as just made branches for a moment (`newBranches`). */
  markBranches: (ids: string[]) => void
  /** Shows fork selections at once (`picked`); `selectBranch` / `selectPath` call it before writing them. */
  pick: (conversationId: string, selection: Record<string, string>) => void
  /** The stored selections caught up: forgets the picks they hold. */
  settlePicks: (conversationId: string, stored: Record<string, string>) => void
}

export const useUi = create<UiState>()((set) => ({
  conversationId: null,
  panel: null,
  expanded: null,
  drafts: {},
  composerDrafts: {},
  systemDrafts: {},
  settingsOpen: false,
  settingsTab: 'providers',
  settingsFocus: null,
  live: {},
  naming: {},
  leaving: {},
  newBranches: {},
  picked: null,
  setConversation: (conversationId) => set({ conversationId, panel: null, expanded: null, picked: null }),
  pick: (conversationId, selection) =>
    set((s) => ({
      picked: { conversationId, selection: { ...(s.picked?.conversationId === conversationId ? s.picked.selection : {}), ...selection } },
    })),
  settlePicks: (conversationId, stored) =>
    set((s) => {
      if (s.picked?.conversationId !== conversationId) return s
      const left = Object.entries(s.picked.selection).filter(([k, v]) => stored[k] !== v)
      if (left.length === Object.keys(s.picked.selection).length) return s
      return { picked: left.length ? { conversationId, selection: Object.fromEntries(left) } : null }
    }),
  openSettings: (tab = 'providers', focus = null) => set({ settingsOpen: true, settingsTab: tab, settingsFocus: focus }),
  closeSettings: () => set({ settingsOpen: false }),
  setLive: (nodeId, live) =>
    set((s) => {
      const next = { ...s.live }
      if (live) next[nodeId] = live
      else delete next[nodeId]
      return { live: next }
    }),
  setPanel: (panel) => set({ panel }),
  expand: (expanded) => set({ expanded }),
  startDraft: (thread, draft) =>
    set((s) => ({ expanded: thread, drafts: { ...s.drafts, [thread]: { ...draft, text: draft.prefill, images: [] } } })),
  saveDraft: (thread, text, images) =>
    set((s) => {
      const d = s.drafts[thread]
      if (!d) return {}
      const next = { ...d, text, images }
      const drafts = { ...s.drafts }
      if (isEmptyDraft(next) && s.expanded !== thread) delete drafts[thread]
      else drafts[thread] = next
      return { drafts }
    }),
  dropDraft: (thread) =>
    set((s) => {
      if (!s.drafts[thread]) return {}
      const drafts = { ...s.drafts }
      delete drafts[thread]
      return { drafts }
    }),
  saveComposerDraft: (key, text, images) =>
    set((s) => {
      const composerDrafts = { ...s.composerDrafts }
      if (text.trim() || images.length) composerDrafts[key] = { text, images }
      else delete composerDrafts[key]
      return { composerDrafts }
    }),
  setSystemDraft: (key, text) =>
    set((s) => {
      const systemDrafts = { ...s.systemDrafts }
      if (text === null) delete systemDrafts[key]
      else systemDrafts[key] = text
      return { systemDrafts }
    }),
  setNaming: (key, on) =>
    set((s) => {
      const naming = { ...s.naming }
      if (on) naming[key] = true
      else delete naming[key]
      return { naming }
    }),
  setLeaving: (thread, on) =>
    set((s) => {
      const leaving = { ...s.leaving }
      if (on) leaving[thread] = true
      else delete leaving[thread]
      return { leaving }
    }),
  markBranches: (ids) => {
    if (!ids.length) return
    set((s) => ({ newBranches: { ...s.newBranches, ...Object.fromEntries(ids.map((id) => [id, true as const])) } }))
    setTimeout(
      () =>
        set((s) => {
          const newBranches = { ...s.newBranches }
          for (const id of ids) delete newBranches[id]
          return { newBranches }
        }),
      BRANCH_ANIM_MS,
    )
  },
}))

/** How long a new branch's switcher dot animates (`.anim-branch-in`). */
export const BRANCH_ANIM_MS = 1200


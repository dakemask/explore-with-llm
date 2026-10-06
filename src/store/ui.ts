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

interface UiState {
  conversationId: string | null
  panel: Panel | null
  /** The thread (or draft) whose card is expanded in the side-question column. */
  expanded: string | null
  /** Unsent side questions by thread id (kept per conversation while the app runs). */
  drafts: Record<string, SideDraft>
  settingsOpen: boolean
  settingsTab: 'providers' | 'general'
  /** Provider (and model) the providers tab should show when it opens. */
  settingsFocus: { providerId: string; model?: string } | null
  live: Record<string, LiveStream>
  /** Conversations / side threads (by id) waiting for their automatic title: the reply or the naming request is running. */
  naming: Record<string, true>
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
  setNaming: (key: string, on: boolean) => void
}

export const useUi = create<UiState>()((set) => ({
  conversationId: null,
  panel: null,
  expanded: null,
  drafts: {},
  settingsOpen: false,
  settingsTab: 'providers',
  settingsFocus: null,
  live: {},
  naming: {},
  setConversation: (conversationId) => set({ conversationId, panel: null, expanded: null }),
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
  setNaming: (key, on) =>
    set((s) => {
      const naming = { ...s.naming }
      if (on) naming[key] = true
      else delete naming[key]
      return { naming }
    }),
}))


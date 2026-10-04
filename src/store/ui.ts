import { create } from 'zustand'
import type { SideAnchor } from '../db'

/** Live text of in-flight requests, kept in memory so streaming doesn't hammer IndexedDB. */
export interface LiveStream {
  content: string
  reasoning: string
}

/**
 * What the right-hand panel shows. `side`: a side-question thread asked from main node `nodeId`;
 * `draft` is set while the thread doesn't exist yet (nothing sent). `detail.back` returns to that panel.
 */
export type Panel =
  | { type: 'detail'; nodeId: string; back?: SidePanel }
  | SidePanel
export type SidePanel = { type: 'side'; nodeId: string; thread: string; draft?: SideAnchor }

interface UiState {
  conversationId: string | null
  panel: Panel | null
  settingsOpen: boolean
  settingsTab: 'providers' | 'general'
  live: Record<string, LiveStream>
  setConversation: (id: string | null) => void
  openSettings: (tab?: UiState['settingsTab']) => void
  closeSettings: () => void
  setLive: (nodeId: string, live: LiveStream | null) => void
  setPanel: (panel: Panel | null) => void
}

export const useUi = create<UiState>()((set) => ({
  conversationId: null,
  panel: null,
  settingsOpen: false,
  settingsTab: 'providers',
  live: {},
  setConversation: (conversationId) => set({ conversationId, panel: null }),
  openSettings: (tab = 'providers') => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  setLive: (nodeId, live) =>
    set((s) => {
      const next = { ...s.live }
      if (live) next[nodeId] = live
      else delete next[nodeId]
      return { live: next }
    }),
  setPanel: (panel) => set({ panel }),
}))

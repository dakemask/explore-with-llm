import { create } from 'zustand'

/** Live text of in-flight requests, kept in memory so streaming doesn't hammer IndexedDB. */
export interface LiveStream {
  content: string
  reasoning: string
}

interface UiState {
  conversationId: string | null
  settingsOpen: boolean
  settingsTab: 'providers' | 'general'
  live: Record<string, LiveStream>
  setConversation: (id: string | null) => void
  openSettings: (tab?: UiState['settingsTab']) => void
  closeSettings: () => void
  setLive: (nodeId: string, live: LiveStream | null) => void
}

export const useUi = create<UiState>()((set) => ({
  conversationId: null,
  settingsOpen: false,
  settingsTab: 'providers',
  live: {},
  setConversation: (conversationId) => set({ conversationId }),
  openSettings: (tab = 'providers') => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  setLive: (nodeId, live) =>
    set((s) => {
      const next = { ...s.live }
      if (live) next[nodeId] = live
      else delete next[nodeId]
      return { live: next }
    }),
}))

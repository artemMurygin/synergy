import { create } from 'zustand'

export type AppSection = 'chats' | 'tasks'

interface UiState {
  dark: boolean
  toggleDark: () => void
  section: AppSection
  setSection: (section: AppSection) => void
}

export const useUiStore = create<UiState>((set) => ({
  dark: false,
  toggleDark: () => set((s) => ({ dark: !s.dark })),
  section: 'chats',
  setSection: (section) => set({ section })
}))

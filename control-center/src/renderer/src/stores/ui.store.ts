import { create } from 'zustand'

export type AppSection = 'chats' | 'tasks'

interface UiState {
  section: AppSection
  setSection: (section: AppSection) => void
}

export const useUiStore = create<UiState>((set) => ({
  section: 'chats',
  setSection: (section) => { set({ section }); }
}))

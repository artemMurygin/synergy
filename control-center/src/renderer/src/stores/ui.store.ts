import { create } from 'zustand'

interface UiState {
  dark: boolean
  toggleDark: () => void
}

export const useUiStore = create<UiState>((set) => ({
  dark: false,
  toggleDark: () => set((s) => ({ dark: !s.dark }))
}))

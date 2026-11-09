import { create } from 'zustand'

const STORAGE_KEY = 'cc.activeThreadId'

interface ChatState {
  activeThreadId: string | null
  setActiveThread: (id: string | null) => void
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // storage unavailable: keep in-memory state only
  }
}

export const useChatStore = create<ChatState>((set) => ({
  activeThreadId: readStored(),
  setActiveThread: (id) => {
    writeStored(id)
    set({ activeThreadId: id })
  }
}))

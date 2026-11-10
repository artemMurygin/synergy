import { create } from 'zustand'
import type { SessionSnapshotView } from '../../../../preload/auth-bridge'

interface SessionStoreState {
  snapshot: SessionSnapshotView
  setSnapshot: (snapshot: SessionSnapshotView) => void
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  snapshot: { state: 'restoring', user: null },
  setSnapshot: (snapshot) => set({ snapshot })
}))

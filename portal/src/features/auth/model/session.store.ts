import { create } from 'zustand'
import type { Profile } from '@/lib/schemas'

export type SessionStatus = 'restoring' | 'signedIn' | 'signedOut' | 'unavailable'

interface SessionState {
  status: SessionStatus
  /** Lives only in memory: never written to localStorage or sessionStorage. */
  accessToken: string | null
  profile: Profile | null
  signIn: (accessToken: string, profile: Profile) => void
  setAccessToken: (accessToken: string) => void
  setProfile: (profile: Profile) => void
  setRestoring: () => void
  signOut: () => void
  markUnavailable: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'restoring',
  accessToken: null,
  profile: null,
  signIn: (accessToken, profile) => set({ status: 'signedIn', accessToken, profile }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setProfile: (profile) => set({ profile }),
  setRestoring: () => set({ status: 'restoring', accessToken: null, profile: null }),
  signOut: () => set({ status: 'signedOut', accessToken: null, profile: null }),
  markUnavailable: () => set({ status: 'unavailable', accessToken: null, profile: null })
}))

import { clearAccessToken } from './access-token-store'
import { onSessionEnded } from './session-channel'

export type AuthStatus =
  'restoring' | 'anonymous' | 'must-change-password' | 'authenticated' | 'offline'

export interface AuthUser {
  id: string
  login: string
}

export interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  /** The server session may still be alive after a logout without connection. */
  notice: 'logout-offline' | null
}

const INITIAL: AuthState = { status: 'restoring', user: null, notice: null }

let state: AuthState = INITIAL
const listeners = new Set<() => void>()

export function getAuthState(): AuthState {
  return state
}

export function setAuthState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch }
  for (const listener of [...listeners]) listener()
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetAuthState(): void {
  state = INITIAL
}

onSessionEnded(() => {
  clearAccessToken()
  setAuthState({ status: 'anonymous', user: null })
})

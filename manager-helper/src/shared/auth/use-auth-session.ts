import { useEffect, useSyncExternalStore } from 'react'
import { changePassword, login, logout, restoreSession } from './auth-service'
import { getAuthState, subscribeAuth, type AuthState } from './auth-state'

export interface AuthSession extends AuthState {
  login: typeof login
  changePassword: typeof changePassword
  logout: typeof logout
  /** Repeat session restore after an `offline` result. */
  retry: typeof restoreSession
}

export function useAuthSession(): AuthSession {
  const state = useSyncExternalStore(subscribeAuth, getAuthState)

  useEffect(() => {
    if (getAuthState().status === 'restoring') void restoreSession()
  }, [])

  return { ...state, login, changePassword, logout, retry: restoreSession }
}

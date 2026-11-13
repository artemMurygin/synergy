import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ServerUnavailableView, SessionRestoringView } from './ui/auth-ui'
import { useSessionStore } from './model/session.store'

export const LOGIN_PATH = '/login'
export const CHANGE_PASSWORD_PATH = '/change-password'
export const DEFAULT_PATH = '/requests'

interface RememberedLocation {
  pathname: string
  search: string
  hash: string
}

/** The address remembered by RequireAuth in the navigation state; only same-site paths are accepted. */
export function returnToFrom(state: unknown): string {
  const from = (state as { from?: Partial<RememberedLocation> } | null)?.from
  const pathname = from?.pathname
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return DEFAULT_PATH
  if (pathname === LOGIN_PATH || pathname === CHANGE_PASSWORD_PATH) return DEFAULT_PATH
  return `${pathname}${from?.search ?? ''}${from?.hash ?? ''}`
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const status = useSessionStore((s) => s.status)
  const mustChangePassword = useSessionStore((s) => s.profile?.mustChangePassword ?? false)
  const location = useLocation()

  switch (status) {
    case 'restoring':
      return <SessionRestoringView />
    case 'unavailable':
      return <ServerUnavailableView />
    case 'signedOut':
      return (
        <Navigate
          to={LOGIN_PATH}
          replace
          state={{ from: { pathname: location.pathname, search: location.search, hash: location.hash } }}
        />
      )
    case 'signedIn':
      if (mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
        return <Navigate to={CHANGE_PASSWORD_PATH} replace />
      }
      return children ?? <Outlet />
  }
}

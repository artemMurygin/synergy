import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { restoreSession } from './auth.api'
import { useSessionStore } from './model/session.store'

/** Restores the session by the refresh cookie on open and drops cached data when the user leaves. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const status = useSessionStore((s) => s.status)

  useEffect(() => {
    void restoreSession()
  }, [])

  useEffect(() => {
    if (status === 'signedOut') queryClient.clear()
  }, [status, queryClient])

  return <>{children}</>
}

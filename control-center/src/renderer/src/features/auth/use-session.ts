import { useEffect } from 'react'
import type { SessionSnapshotView } from '../../../../preload/auth-bridge'
import { getSessionState, subscribeToSession } from './auth.api'
import { useSessionStore } from './session.store'

export function useSession(): SessionSnapshotView {
  const snapshot = useSessionStore((store) => store.snapshot)

  useEffect(() => {
    let hasReceivedPush = false
    let isActive = true
    const unsubscribe = subscribeToSession((next) => {
      hasReceivedPush = true
      useSessionStore.getState().setSnapshot(next)
    })
    getSessionState()
      .then((initial) => {
        if (isActive && !hasReceivedPush) useSessionStore.getState().setSnapshot(initial)
      })
      .catch(() => undefined)
    return () => {
      isActive = false
      unsubscribe()
    }
  }, [])

  return snapshot
}

import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from './session.store'

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState(useSessionStore.getInitialState())
  })

  it('starts in the restoring state without a user', () => {
    expect(useSessionStore.getState().snapshot).toEqual({ state: 'restoring', user: null })
  })

  it('setSnapshot replaces the snapshot', () => {
    const snapshot = { state: 'authenticated' as const, user: { id: 'u1', login: 'admin' } }
    useSessionStore.getState().setSnapshot(snapshot)
    expect(useSessionStore.getState().snapshot).toEqual(snapshot)
  })

  it('keeps optional fields of the snapshot', () => {
    useSessionStore
      .getState()
      .setSnapshot({ state: 'connectionError', user: null, warning: 'offline', retryAfterSec: 5 })
    expect(useSessionStore.getState().snapshot.retryAfterSec).toBe(5)
    expect(useSessionStore.getState().snapshot.warning).toBe('offline')
  })
})

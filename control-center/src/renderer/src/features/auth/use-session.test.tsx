import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { authenticatedSnapshot, installBridgeMock } from './auth-test-utils'
import { useSession } from './use-session'
import { useSessionStore } from './session.store'

describe('useSession', () => {
  beforeEach(() => {
    useSessionStore.setState(useSessionStore.getInitialState())
  })

  it('is restoring before getState resolves', () => {
    installBridgeMock(authenticatedSnapshot)
    const { result } = renderHook(() => useSession())
    expect(result.current.state).toBe('restoring')
  })

  it('loads the initial snapshot through getState', async () => {
    const mock = installBridgeMock(authenticatedSnapshot)
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.state).toBe('authenticated'))
    expect(result.current.user).toEqual({ id: 'u1', login: 'admin' })
    expect(mock.getState).toHaveBeenCalledTimes(1)
  })

  it('updates on onSessionChanged', async () => {
    const mock = installBridgeMock(authenticatedSnapshot)
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.state).toBe('authenticated'))
    act(() => mock.emit({ state: 'unauthenticated', user: null }))
    expect(result.current.state).toBe('unauthenticated')
    expect(result.current.user).toBeNull()
  })

  it('does not let a late getState overwrite a newer pushed snapshot', async () => {
    const mock = installBridgeMock()
    let resolveState: (value: typeof authenticatedSnapshot) => void = () => {}
    mock.getState.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve
      })
    )
    const { result } = renderHook(() => useSession())
    act(() => mock.emit({ state: 'unauthenticated', user: null }))
    await act(async () => {
      resolveState(authenticatedSnapshot)
    })
    expect(result.current.state).toBe('unauthenticated')
  })

  it('unsubscribes on unmount', async () => {
    const mock = installBridgeMock(authenticatedSnapshot)
    const { unmount } = renderHook(() => useSession())
    await waitFor(() => expect(mock.listenerCount()).toBe(1))
    unmount()
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1)
    expect(mock.listenerCount()).toBe(0)
  })
})

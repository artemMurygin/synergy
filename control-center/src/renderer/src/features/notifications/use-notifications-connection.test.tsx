import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useNotificationsConnection } from './use-notifications-connection'
import { installNotificationsBridgeMock } from './test-utils'

afterEach(cleanup)

describe('useNotificationsConnection', () => {
  it('starts from the state of the socket: online', async () => {
    installNotificationsBridgeMock('online')
    const { result } = renderHook(() => useNotificationsConnection())
    await waitFor(() => {
      expect(result.current).toBe('online')
    })
  })

  it('shows "reconnecting" while the socket is offline or connecting and "online" again after', async () => {
    const mock = installNotificationsBridgeMock('offline')
    const { result } = renderHook(() => useNotificationsConnection())
    await waitFor(() => {
      expect(result.current).toBe('reconnecting')
    })
    act(() => {
      mock.emitState('online')
    })
    expect(result.current).toBe('online')
    act(() => {
      mock.emitState('connecting')
    })
    expect(result.current).toBe('reconnecting')
  })

  it('unsubscribes on unmount', () => {
    const mock = installNotificationsBridgeMock('online')
    const { unmount } = renderHook(() => useNotificationsConnection())
    expect(mock.listenerCount()).toBe(1)
    unmount()
    expect(mock.listenerCount()).toBe(0)
  })
})

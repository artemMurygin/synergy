import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isNetworkError } from './is-network-error'
import { useServerReachability } from './use-server-reachability'

describe('isNetworkError', () => {
  it('recognizes fetch failures and net::ERR_*', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(true)
    expect(isNetworkError('net::ERR_INTERNET_DISCONNECTED')).toBe(true)
  })

  it('does not take other errors for a lost connection', () => {
    expect(isNetworkError(new Error('Агент вернул ошибку'))).toBe(false)
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
  })
})

describe('useServerReachability', () => {
  it('is online at the start and goes offline on a network error', () => {
    const { result } = renderHook(() => useServerReachability(vi.fn()))
    expect(result.current.connection).toBe('online')
    act(() => {
      result.current.reportError(new Error('other'))
    })
    expect(result.current.connection).toBe('online')
    act(() => {
      result.current.reportError(new TypeError('Failed to fetch'))
    })
    expect(result.current.connection).toBe('offline')
  })

  it('retry calls probe and returns online', async () => {
    const probe = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useServerReachability(probe))
    act(() => {
      result.current.reportError(new TypeError('Failed to fetch'))
    })
    await act(async () => {
      await result.current.retry()
    })
    expect(probe).toHaveBeenCalledTimes(1)
    expect(result.current.connection).toBe('online')
    expect(result.current.retrying).toBe(false)
  })

  it('stays offline while the probe fails, showing retrying meanwhile', async () => {
    let fail: (e: unknown) => void = () => undefined
    const probe = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject
        }),
    )
    const { result } = renderHook(() => useServerReachability(probe))
    act(() => {
      result.current.reportError(new TypeError('Failed to fetch'))
    })
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.retry()
    })
    expect(result.current.retrying).toBe(true)
    await act(async () => {
      fail(new TypeError('Failed to fetch'))
      await pending
    })
    expect(result.current.retrying).toBe(false)
    expect(result.current.connection).toBe('offline')
  })
})

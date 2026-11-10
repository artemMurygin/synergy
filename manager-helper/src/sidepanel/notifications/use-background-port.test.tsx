import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChromeFake, makeNotification } from '@/background/notifications/chrome-fake.testing'
import type { ChromeFake, FakePort } from '@/background/notifications/chrome-fake.testing'
import { useBackgroundPort } from './use-background-port'

let chromeFake: ChromeFake

function ports(): FakePort[] {
  return chromeFake.runtime.connect.mock.results.flatMap((result) =>
    result.type === 'return' ? [result.value] : [],
  )
}

function lastPort(): FakePort {
  const port = ports().at(-1)
  if (port === undefined) throw new Error('no port was opened')
  return port
}

beforeEach(() => {
  chromeFake = installChromeFake()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useBackgroundPort', () => {
  it('connects the notifications port', () => {
    renderHook(() => useBackgroundPort(vi.fn()))
    expect(chromeFake.runtime.connect).toHaveBeenCalledWith({ name: 'notifications' })
  })

  it('delivers events and tracks the connection state', () => {
    const onMessage = vi.fn()
    const { result } = renderHook(() => useBackgroundPort(onMessage))
    expect(result.current.connectionState).toBe('connecting')
    const event = {
      type: 'notification.created',
      payload: { notification: makeNotification('n1', '2026-11-10T09:00:00.000Z'), unreadCount: 1 },
    }
    act(() => {
      lastPort().onMessage.emit({ kind: 'connection-state', state: 'online' })
      lastPort().onMessage.emit({ kind: 'event', event })
    })
    expect(result.current.connectionState).toBe('online')
    expect(onMessage).toHaveBeenCalledWith({ kind: 'event', event })
    expect(onMessage).toHaveBeenCalledWith({ kind: 'connection-state', state: 'online' })
  })

  it('ignores malformed messages', () => {
    const onMessage = vi.fn()
    renderHook(() => useBackgroundPort(onMessage))
    act(() => {
      lastPort().onMessage.emit({ kind: 'event', event: { type: 'boom' } })
    })
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('reconnects after the port is dropped', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useBackgroundPort(vi.fn()))
    act(() => {
      lastPort().onMessage.emit({ kind: 'connection-state', state: 'online' })
      lastPort().onDisconnect.emit()
    })
    expect(result.current.connectionState).toBe('connecting')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(ports()).toHaveLength(2)
  })

  it('uses the latest callback without reconnecting', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ onMessage }) => useBackgroundPort(onMessage), {
      initialProps: { onMessage: first },
    })
    rerender({ onMessage: second })
    act(() => {
      lastPort().onMessage.emit({ kind: 'connection-state', state: 'offline' })
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(ports()).toHaveLength(1)
  })

  it('disconnects on unmount and does not reconnect', () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useBackgroundPort(vi.fn()))
    const port = lastPort()
    const disconnect = vi.spyOn(port, 'disconnect')
    unmount()
    expect(disconnect).toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(ports()).toHaveLength(1)
  })
})

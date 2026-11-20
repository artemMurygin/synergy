import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ConnectionState } from '@/shared/notifications/panel-protocol'
import { useNotificationsConnection } from './use-notifications-connection'

function render(initial: ConnectionState) {
  return renderHook(({ state }) => useNotificationsConnection(state), {
    initialProps: { state: initial },
  })
}

describe('useNotificationsConnection', () => {
  it('is online while the background socket is online', () => {
    expect(render('online').result.current).toBe('online')
  })

  it('does not flash the banner while the panel connects for the first time', () => {
    expect(render('connecting').result.current).toBe('online')
  })

  it('reconnects when the background socket is offline', () => {
    expect(render('offline').result.current).toBe('reconnecting')
  })

  it('keeps the banner during a reconnect attempt and drops it once online', () => {
    const hook = render('online')
    hook.rerender({ state: 'offline' })
    expect(hook.result.current).toBe('reconnecting')
    hook.rerender({ state: 'connecting' })
    expect(hook.result.current).toBe('reconnecting')
    hook.rerender({ state: 'online' })
    expect(hook.result.current).toBe('online')
  })
})

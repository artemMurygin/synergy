import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakePort, installChromeFake } from './chrome-fake.testing'
import type { ChromeFake } from './chrome-fake.testing'
import { makeNotification } from './chrome-fake.testing'
import { createPanelPortHub } from './panel-port-hub'

let chromeFake: ChromeFake

function openPort(name = 'notifications'): FakePort {
  const port = new FakePort(name)
  chromeFake.runtime.onConnect.emit(port)
  return port
}

beforeEach(() => {
  chromeFake = installChromeFake()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('panel-port-hub', () => {
  it('counts the panel as open while a notifications port is connected', () => {
    const hub = createPanelPortHub()
    hub.attach()
    expect(hub.isPanelOpen()).toBe(false)
    const first = openPort()
    const second = openPort()
    expect(hub.isPanelOpen()).toBe(true)
    first.disconnect()
    expect(hub.isPanelOpen()).toBe(true)
    second.disconnect()
    expect(hub.isPanelOpen()).toBe(false)
  })

  it('ignores ports with another name', () => {
    const hub = createPanelPortHub()
    hub.attach()
    openPort('other')
    expect(hub.isPanelOpen()).toBe(false)
  })

  it('sends the current connection state to a new port', () => {
    const hub = createPanelPortHub()
    hub.attach()
    hub.setConnectionState('online')
    const port = openPort()
    expect(port.posted).toEqual([{ kind: 'connection-state', state: 'online' }])
  })

  it('gives a port opened after several changes only the latest state', () => {
    const hub = createPanelPortHub()
    hub.attach()
    hub.setConnectionState('online')
    hub.setConnectionState('offline')
    hub.setConnectionState('connecting')
    const port = openPort()
    expect(port.posted).toEqual([{ kind: 'connection-state', state: 'connecting' }])
  })

  it('forwards events and state changes to every open port', () => {
    const hub = createPanelPortHub()
    hub.attach()
    const first = openPort()
    const second = openPort()
    const event = {
      type: 'notification.created' as const,
      payload: { notification: makeNotification('n1', '2026-11-10T09:00:00.000Z'), unreadCount: 1 },
    }
    hub.broadcast({ kind: 'event', event })
    hub.setConnectionState('connecting')
    const expected = [
      { kind: 'connection-state', state: 'offline' },
      { kind: 'event', event },
      { kind: 'connection-state', state: 'connecting' },
    ]
    expect(first.posted).toEqual(expected)
    expect(second.posted).toEqual(expected)
  })

  it('stops forwarding to a closed port', () => {
    const hub = createPanelPortHub()
    hub.attach()
    const port = openPort()
    port.disconnect()
    hub.setConnectionState('online')
    expect(port.posted).toEqual([{ kind: 'connection-state', state: 'offline' }])
  })
})

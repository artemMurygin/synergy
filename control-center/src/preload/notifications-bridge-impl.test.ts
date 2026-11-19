import { describe, expect, it, vi } from 'vitest'
import type { NotificationEventView } from './notifications-bridge'
import { createNotificationsBridge } from './notifications-bridge-impl'

type Listener = (event: unknown, payload: unknown) => void

const createdEvent: NotificationEventView = {
  type: 'notification.created',
  notification: {
    id: 'n1',
    type: 'task.assigned',
    title: 'Новая задача',
    body: 'Текст',
    target: { type: 'task', id: 't1' },
    actorId: null,
    createdAt: '2026-11-10T10:00:00.000Z',
    readAt: null
  },
  unreadCount: 1
}

function createFakeIpcRenderer() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    invoke: vi.fn(),
    on: vi.fn((channel: string, listener: Listener) => {
      const set = listeners.get(channel) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(channel, set)
    }),
    removeListener: vi.fn((channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener)
    }),
    emit(channel: string, payload: unknown): void {
      listeners.get(channel)?.forEach((listener) => { listener({ sender: 'ipc' }, payload); })
    },
    count(channel: string): number {
      return listeners.get(channel)?.size ?? 0
    }
  }
}

describe('createNotificationsBridge', () => {
  it('exposes only the contract methods', () => {
    const bridge = createNotificationsBridge(createFakeIpcRenderer())
    expect(Object.keys(bridge).sort()).toEqual(['getConnectionState', 'onConnectionState', 'onEvent'])
  })

  it('onEvent delivers events without the IPC event object and unsubscribes', () => {
    const ipc = createFakeIpcRenderer()
    const bridge = createNotificationsBridge(ipc)
    const listener = vi.fn()
    const unsubscribe = bridge.onEvent(listener)
    expect(ipc.count('notifications:event')).toBe(1)
    ipc.emit('notifications:event', createdEvent)
    expect(listener).toHaveBeenCalledWith(createdEvent)
    unsubscribe()
    expect(ipc.count('notifications:event')).toBe(0)
    ipc.emit('notifications:event', createdEvent)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('onConnectionState delivers states and unsubscribes only its own listener', () => {
    const ipc = createFakeIpcRenderer()
    const bridge = createNotificationsBridge(ipc)
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = bridge.onConnectionState(first)
    bridge.onConnectionState(second)
    unsubscribeFirst()
    expect(ipc.count('notifications:connectionState')).toBe(1)
    ipc.emit('notifications:connectionState', 'online')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('online')
  })

  it('getConnectionState returns the current state from main', async () => {
    const ipc = createFakeIpcRenderer()
    ipc.invoke.mockResolvedValueOnce('connecting')
    const bridge = createNotificationsBridge(ipc)
    await expect(bridge.getConnectionState()).resolves.toBe('connecting')
    expect(ipc.invoke).toHaveBeenCalledWith('notifications:getConnectionState')
  })

  it('never passes a token through the bridge', async () => {
    const ipc = createFakeIpcRenderer()
    const bridge = createNotificationsBridge(ipc)
    await bridge.getConnectionState()
    bridge.onEvent(vi.fn())
    bridge.onConnectionState(vi.fn())
    const channels = JSON.stringify([...ipc.invoke.mock.calls, ...ipc.on.mock.calls.map(([channel]) => channel)])
    expect(channels).not.toMatch(/token/i)
    expect(Object.keys(bridge).join(',')).not.toMatch(/token/i)
  })
})

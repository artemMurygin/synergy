import { describe, expect, it, vi } from 'vitest'
import type { NotificationConnectionState, NotificationEventView } from '../../preload/notifications-bridge'
import { registerNotificationsIpc, type NotificationsSourcePort } from './notifications-ipc'

type Handler = (event: unknown, ...args: unknown[]) => unknown

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

function createFakeIpcMain() {
  const handlers = new Map<string, Handler>()
  return {
    handlers,
    handle(channel: string, handler: Handler): void {
      handlers.set(channel, handler)
    },
    invoke(channel: string, ...args: unknown[]): unknown {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`no handler for ${channel}`)
      return handler({}, ...args)
    }
  }
}

function createFakeSource() {
  const eventListeners = new Set<(event: NotificationEventView) => void>()
  const stateListeners = new Set<(state: NotificationConnectionState) => void>()
  let state: NotificationConnectionState = 'offline'
  const source = {
    getConnectionState: () => state,
    onEvent: (listener: (event: NotificationEventView) => void) => {
      eventListeners.add(listener)
      return () => {
        eventListeners.delete(listener)
      }
    },
    onConnectionState: (listener: (next: NotificationConnectionState) => void) => {
      stateListeners.add(listener)
      return () => {
        stateListeners.delete(listener)
      }
    }
  } satisfies NotificationsSourcePort
  return {
    source,
    emitEvent: (event: NotificationEventView) => eventListeners.forEach((listener) => listener(event)),
    setState: (next: NotificationConnectionState) => {
      state = next
      stateListeners.forEach((listener) => listener(next))
    },
    listenerCount: () => eventListeners.size + stateListeners.size
  }
}

function setup() {
  const ipcMain = createFakeIpcMain()
  const fake = createFakeSource()
  const windows = [{ webContents: { send: vi.fn() } }, { webContents: { send: vi.fn() } }]
  const unregister = registerNotificationsIpc({ ipcMain, socket: fake.source, getWindows: () => windows })
  return { ipcMain, fake, windows, unregister }
}

describe('registerNotificationsIpc', () => {
  it('registers only the connection state channel', () => {
    const { ipcMain } = setup()
    expect([...ipcMain.handlers.keys()]).toEqual(['notifications:getConnectionState'])
  })

  it('returns the current connection state', () => {
    const { ipcMain, fake } = setup()
    expect(ipcMain.invoke('notifications:getConnectionState')).toBe('offline')
    fake.setState('online')
    expect(ipcMain.invoke('notifications:getConnectionState')).toBe('online')
  })

  it('sends events to every window', () => {
    const { fake, windows } = setup()
    fake.emitEvent(createdEvent)
    for (const window of windows) {
      expect(window.webContents.send).toHaveBeenCalledWith('notifications:event', createdEvent)
    }
  })

  it.each(['connecting', 'online', 'offline'] as const)('sends the %s state to every window', (state) => {
    const { fake, windows } = setup()
    fake.setState(state)
    for (const window of windows) {
      expect(window.webContents.send).toHaveBeenCalledWith('notifications:connectionState', state)
    }
  })

  it('stops forwarding after unregister', () => {
    const { fake, windows, unregister } = setup()
    unregister()
    expect(fake.listenerCount()).toBe(0)
    fake.emitEvent(createdEvent)
    expect(windows[0].webContents.send).not.toHaveBeenCalled()
  })
})

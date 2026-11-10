import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/shared/auth/access-token-store'
import { resetAuthState, setAuthState } from '@/shared/auth/auth-state'
import { restoreSession } from '@/shared/auth/auth-service'
import { endSession, startSession } from '@/shared/auth/session-channel'
import { listNotifications, markNotificationRead } from '@/shared/notifications/notifications-api'
import { FakePort, installChromeFake, makeNotification } from './chrome-fake.testing'
import type { ChromeFake } from './chrome-fake.testing'
import type { FakeSocket } from './fake-socket.testing'
import { startBackgroundNotifications } from './start-background-notifications'

const socketLog = vi.hoisted(() => {
  const sockets: unknown[] = []
  return { sockets }
})

vi.mock('socket.io-client', async () => {
  const { FakeSocket: Fake } = await import('./fake-socket.testing')
  return {
    io: vi.fn((url: string, options: { transports?: string[]; auth?: unknown }) => {
      const socket = new Fake(url, options)
      socketLog.sockets.push(socket)
      return socket
    }),
  }
})
vi.mock('@/shared/auth/auth-service', () => ({ restoreSession: vi.fn() }))
vi.mock('@/shared/notifications/notifications-api', () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}))
vi.mock('@/shared/settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

let chromeFake: ChromeFake
let stop: () => void

function sockets(): FakeSocket[] {
  return socketLog.sockets.filter(
    (socket): socket is FakeSocket =>
      typeof socket === 'object' && socket !== null && 'simulateConnect' in socket,
  )
}

function lastSocket(): FakeSocket {
  const socket = sockets().at(-1)
  if (socket === undefined) throw new Error('no socket was opened')
  return socket
}

function restoresAs(status: 'authenticated' | 'anonymous') {
  vi.mocked(restoreSession).mockImplementation(() => {
    if (status === 'authenticated') {
      setAccessToken('tok')
      setAuthState({ status, user: { id: 'u1', login: 'anna' } })
    } else {
      setAuthState({ status, user: null })
    }
    return Promise.resolve()
  })
}

async function connected(): Promise<FakeSocket> {
  await vi.waitFor(() => {
    expect(sockets()).toHaveLength(1)
  })
  const socket = lastSocket()
  socket.simulateConnect()
  return socket
}

beforeEach(() => {
  socketLog.sockets.length = 0
  chromeFake = installChromeFake()
  restoresAs('authenticated')
  vi.mocked(listNotifications).mockResolvedValue({ items: [], total: 0, limit: 50, page: 0 })
  vi.mocked(markNotificationRead).mockResolvedValue(0)
  stop = startBackgroundNotifications()
})
afterEach(() => {
  stop()
  clearAccessToken()
  resetAuthState()
  vi.unstubAllGlobals()
})

describe('startBackgroundNotifications: connecting', () => {
  it('restores the session and connects when the browser starts', async () => {
    chromeFake.runtime.onStartup.emit()
    await connected()
    expect(restoreSession).toHaveBeenCalled()
    expect(lastSocket().url).toBe('http://api.test/notifications')
  })

  it('connects when the extension is installed or updated', async () => {
    chromeFake.runtime.onInstalled.emit()
    await connected()
  })

  it('connects when the panel reports a started session', async () => {
    startSession()
    await connected()
    expect(restoreSession).toHaveBeenCalled()
  })

  it('does not connect when the session cannot be restored', async () => {
    restoresAs('anonymous')
    chromeFake.runtime.onStartup.emit()
    await vi.waitFor(() => {
      expect(restoreSession).toHaveBeenCalled()
    })
    await Promise.resolve()
    expect(sockets()).toHaveLength(0)
  })

  it('opens one connection for repeated triggers', async () => {
    chromeFake.runtime.onStartup.emit()
    chromeFake.runtime.onInstalled.emit()
    await connected()
    chromeFake.runtime.onStartup.emit()
    await Promise.resolve()
    expect(sockets()).toHaveLength(1)
  })

  it('reconnects from the watchdog alarm when signed in without a socket', async () => {
    setAccessToken('tok')
    setAuthState({ status: 'authenticated', user: { id: 'u1', login: 'anna' } })
    chromeFake.alarms.onAlarm.emit({ name: 'notifications-watchdog' })
    await connected()
  })

  it('connects again after a restart of the service worker while signed in', async () => {
    chromeFake.runtime.onStartup.emit()
    await connected()
    stop()
    socketLog.sockets.length = 0
    resetAuthState()
    clearAccessToken()
    stop = startBackgroundNotifications()
    await connected()
  })
})

describe('startBackgroundNotifications: after connecting', () => {
  it('shows missed unread notifications and sets the badge', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      items: [makeNotification('n1', '2026-11-10T09:00:00.000Z')],
      total: 1,
      limit: 50,
      page: 0,
    })
    chromeFake.runtime.onStartup.emit()
    await connected()
    await vi.waitFor(() => {
      expect(chromeFake.notifications.create).toHaveBeenCalledWith('n1', expect.anything())
    })
    expect(listNotifications).toHaveBeenCalledWith({ page: 0, limit: 50, unreadOnly: true })
    expect(chromeFake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '1' })
  })

  it('handles a new notification: badge, panel ports and a system notification', async () => {
    chromeFake.runtime.onStartup.emit()
    const socket = await connected()
    const notification = makeNotification('n9', '2026-11-10T10:00:00.000Z')
    socket.emit('notification.created', { notification, unreadCount: 4 })
    await vi.waitFor(() => {
      expect(chromeFake.notifications.create).toHaveBeenCalledWith('n9', expect.anything())
    })
    expect(chromeFake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '4' })
  })

  it('forwards events to an open panel instead of a system notification', async () => {
    chromeFake.runtime.onStartup.emit()
    const socket = await connected()
    const port = new FakePort('notifications')
    chromeFake.runtime.onConnect.emit(port)
    const notification = makeNotification('n9', '2026-11-10T10:00:00.000Z')
    socket.emit('notification.created', { notification, unreadCount: 4 })
    await vi.waitFor(() => {
      expect(port.posted).toContainEqual({
        kind: 'event',
        event: { type: 'notification.created', payload: { notification, unreadCount: 4 } },
      })
    })
    expect(port.posted).toContainEqual({ kind: 'connection-state', state: 'online' })
    expect(chromeFake.notifications.create).not.toHaveBeenCalledWith('n9', expect.anything())
  })

  it('updates the badge and closes system notifications read elsewhere', async () => {
    chromeFake.runtime.onStartup.emit()
    const socket = await connected()
    socket.emit('notification.created', {
      notification: makeNotification('n9', '2026-11-10T10:00:00.000Z'),
      unreadCount: 1,
    })
    await vi.waitFor(() => {
      expect(chromeFake.shownNotifications.has('n9')).toBe(true)
    })
    socket.emit('notification.read', { all: true, unreadCount: 0 })
    await vi.waitFor(() => {
      expect(chromeFake.shownNotifications.has('n9')).toBe(false)
    })
    expect(chromeFake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
  })
})

describe('startBackgroundNotifications: session ended', () => {
  it('disconnects, clears the badge and closes shown notifications', async () => {
    chromeFake.runtime.onStartup.emit()
    const socket = await connected()
    socket.emit('notification.created', {
      notification: makeNotification('n9', '2026-11-10T10:00:00.000Z'),
      unreadCount: 1,
    })
    await vi.waitFor(() => {
      expect(chromeFake.shownNotifications.has('n9')).toBe(true)
    })
    endSession()
    expect(socket.disconnectCalls).toBe(1)
    await vi.waitFor(() => {
      expect(chromeFake.shownNotifications.size).toBe(0)
    })
    expect(chromeFake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
  })

  it('does not reconnect from the watchdog after the session ended', async () => {
    chromeFake.runtime.onStartup.emit()
    await connected()
    endSession()
    chromeFake.alarms.onAlarm.emit({ name: 'notifications-watchdog' })
    await Promise.resolve()
    await Promise.resolve()
    expect(sockets()).toHaveLength(1)
  })
})

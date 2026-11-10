import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '../auth/access-token-store'
import { resetAuthState } from '../auth/auth-state'
import {
  NotificationNotFoundError,
  NotificationsApiError,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications-api'

vi.mock('../settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

const dto = {
  id: 'n1',
  type: 'task.assigned',
  title: 'Новая задача',
  body: 'anna назначила вам задачу «КП»',
  target: { type: 'task', id: 't1' },
  actorId: 'u2',
  createdAt: '2026-11-10T09:00:00.000Z',
  readAt: null,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Sender = (url: string, init?: RequestInit) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn<Sender>>

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  return { url: call[0], init: call[1] ?? {} }
}

beforeEach(() => {
  fetchMock = vi.fn<Sender>()
  vi.stubGlobal('fetch', fetchMock)
  setAccessToken('tok')
})
afterEach(() => {
  clearAccessToken()
  resetAuthState()
  vi.unstubAllGlobals()
})

describe('listNotifications', () => {
  it('requests a page through authFetch and parses it', async () => {
    fetchMock.mockResolvedValue(json({ items: [dto], total: 1, limit: 20, page: 0 }))
    const page = await listNotifications({ page: 0, limit: 20 })
    expect(page).toEqual({ items: [dto], total: 1, limit: 20, page: 0 })
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/notifications?limit=20&page=0')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
  })

  it('passes the unread filter', async () => {
    fetchMock.mockResolvedValue(json({ items: [], total: 0, limit: 50, page: 0 }))
    await listNotifications({ page: 0, limit: 50, unreadOnly: true })
    expect(lastCall().url).toBe('http://api.test/notifications?limit=50&page=0&unreadOnly=true')
  })

  it('rejects a response in an unexpected format', async () => {
    fetchMock.mockResolvedValue(json({ items: [{ id: 'n1' }], total: 1, limit: 20, page: 0 }))
    await expect(listNotifications({ page: 0, limit: 20 })).rejects.toBeInstanceOf(
      NotificationsApiError,
    )
  })

  it('reports an unreachable server', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(listNotifications({ page: 0, limit: 20 })).rejects.toBeInstanceOf(
      NotificationsApiError,
    )
  })

  it('reports a server error with its message', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Сломалось' }, 500))
    await expect(listNotifications({ page: 0, limit: 20 })).rejects.toThrow('Сломалось')
  })
})

describe('getUnreadCount', () => {
  it('reads the unread count', async () => {
    fetchMock.mockResolvedValue(json({ unreadCount: 3 }))
    expect(await getUnreadCount()).toBe(3)
    expect(lastCall().url).toBe('http://api.test/notifications/unread-count')
  })
})

describe('markNotificationRead', () => {
  it('posts the read mark and returns the unread count', async () => {
    fetchMock.mockResolvedValue(json({ unreadCount: 2 }))
    expect(await markNotificationRead('n/1')).toBe(2)
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/notifications/n%2F1/read')
    expect(init.method).toBe('POST')
  })

  it('maps 404 to NotificationNotFoundError', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Не найдено' }, 404))
    await expect(markNotificationRead('n1')).rejects.toBeInstanceOf(NotificationNotFoundError)
  })
})

describe('markAllNotificationsRead', () => {
  it('posts read-all and returns the unread count', async () => {
    fetchMock.mockResolvedValue(json({ unreadCount: 0 }))
    expect(await markAllNotificationsRead()).toBe(0)
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/notifications/read-all')
    expect(init.method).toBe('POST')
  })
})

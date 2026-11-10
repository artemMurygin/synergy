import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChromeFake, makeNotification } from '@/background/notifications/chrome-fake.testing'
import type { ChromeFake, FakePort } from '@/background/notifications/chrome-fake.testing'
import type * as NotificationsApi from '@/shared/notifications/notifications-api'
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/shared/notifications/notifications-api'
import type { NotificationPage } from '@/shared/notifications/notifications-schema'
import { useNotifications } from './use-notifications'

vi.mock('@/shared/notifications/notifications-api', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationsApi>()),
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

let chromeFake: ChromeFake

function at(minute: number): string {
  return `2026-11-10T09:${String(minute).padStart(2, '0')}:00.000Z`
}

const N1 = makeNotification('n1', at(1))
const N2 = makeNotification('n2', at(2))
const N3 = makeNotification('n3', at(3))

function pageOf(
  items: ReturnType<typeof makeNotification>[],
  total: number,
  page = 0,
): NotificationPage {
  return { items, total, limit: 20, page }
}

function lastPort(): FakePort {
  const result = chromeFake.runtime.connect.mock.results.at(-1)
  if (result?.type !== 'return') throw new Error('no port was opened')
  return result.value
}

function emitFromBackground(message: unknown) {
  act(() => {
    lastPort().onMessage.emit(message)
  })
}

async function loaded(isEnabled = true) {
  const hook = renderHook(({ enabled }) => useNotifications(enabled), {
    initialProps: { enabled: isEnabled },
  })
  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready')
  })
  return hook
}

beforeEach(() => {
  chromeFake = installChromeFake()
  vi.mocked(listNotifications).mockReset()
  vi.mocked(getUnreadCount).mockReset()
  vi.mocked(markNotificationRead).mockReset()
  vi.mocked(markAllNotificationsRead).mockReset()
  vi.mocked(listNotifications).mockResolvedValue(pageOf([N2, N1], 2))
  vi.mocked(getUnreadCount).mockResolvedValue(2)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useNotifications: loading', () => {
  it('loads the first page and the unread count through REST', async () => {
    const { result } = renderHook(() => useNotifications(true))
    expect(result.current.isInitialLoad).toBe(true)
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(result.current.items.map((n) => n.id)).toEqual(['n2', 'n1'])
    expect(result.current.unreadCount).toBe(2)
    expect(result.current.isInitialLoad).toBe(false)
    expect(result.current.hasMore).toBe(false)
    expect(listNotifications).toHaveBeenCalledWith({ page: 0, limit: 20 })
  })

  it('does not load while disabled', async () => {
    renderHook(() => useNotifications(false))
    await Promise.resolve()
    expect(listNotifications).not.toHaveBeenCalled()
  })

  it('clears the list when disabled after a logout', async () => {
    const { result, rerender } = await loaded()
    rerender({ enabled: false })
    expect(result.current.items).toEqual([])
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.status).toBe('idle')
  })

  it('reports a failed first load and retries', async () => {
    vi.mocked(listNotifications).mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useNotifications(true))
    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })
    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(result.current.items).toHaveLength(2)
  })

  it('loads the next page and appends it without duplicates', async () => {
    vi.mocked(listNotifications).mockImplementation(({ page }) =>
      Promise.resolve(page === 0 ? pageOf([N3, N2], 3) : pageOf([N2, N1], 3, 1)),
    )
    const { result } = await loaded()
    expect(result.current.hasMore).toBe(true)
    act(() => {
      result.current.loadMore()
    })
    expect(result.current.loadMoreStatus).toBe('loading')
    await waitFor(() => {
      expect(result.current.loadMoreStatus).toBe('idle')
    })
    expect(result.current.items.map((n) => n.id)).toEqual(['n3', 'n2', 'n1'])
    expect(result.current.hasMore).toBe(false)
    expect(listNotifications).toHaveBeenLastCalledWith({ page: 1, limit: 20 })
  })

  it('reports a failed next page without losing the list', async () => {
    vi.mocked(listNotifications).mockResolvedValueOnce(pageOf([N3, N2], 3))
    const { result } = await loaded()
    vi.mocked(listNotifications).mockRejectedValueOnce(new Error('offline'))
    act(() => {
      result.current.loadMore()
    })
    await waitFor(() => {
      expect(result.current.loadMoreStatus).toBe('error')
    })
    expect(result.current.items).toHaveLength(2)
  })
})

describe('useNotifications: background events', () => {
  it('adds a new notification on top, updates the count and shows a toast', async () => {
    const { result } = await loaded()
    emitFromBackground({
      kind: 'event',
      event: { type: 'notification.created', payload: { notification: N3, unreadCount: 3 } },
    })
    expect(result.current.items.map((n) => n.id)).toEqual(['n3', 'n2', 'n1'])
    expect(result.current.unreadCount).toBe(3)
    expect(result.current.toast?.id).toBe('n3')
    act(() => {
      result.current.dismissToast()
    })
    expect(result.current.toast).toBe(null)
  })

  it('ignores a repeated notification by id', async () => {
    const { result } = await loaded()
    emitFromBackground({
      kind: 'event',
      event: { type: 'notification.created', payload: { notification: N2, unreadCount: 2 } },
    })
    expect(result.current.items.map((n) => n.id)).toEqual(['n2', 'n1'])
    expect(result.current.toast).toBe(null)
  })

  it('marks notifications read elsewhere', async () => {
    const { result } = await loaded()
    emitFromBackground({
      kind: 'event',
      event: { type: 'notification.read', payload: { notificationIds: ['n2'], unreadCount: 1 } },
    })
    expect(result.current.items.find((n) => n.id === 'n2')?.readAt).not.toBe(null)
    expect(result.current.items.find((n) => n.id === 'n1')?.readAt).toBe(null)
    expect(result.current.unreadCount).toBe(1)
    emitFromBackground({
      kind: 'event',
      event: { type: 'notification.read', payload: { all: true, unreadCount: 0 } },
    })
    expect(result.current.items.every((n) => n.readAt !== null)).toBe(true)
    expect(result.current.unreadCount).toBe(0)
  })

  it('refreshes quietly when the background connection comes back online', async () => {
    const { result } = await loaded()
    emitFromBackground({ kind: 'connection-state', state: 'offline' })
    vi.mocked(listNotifications).mockResolvedValue(pageOf([N3, N2, N1], 3))
    vi.mocked(getUnreadCount).mockResolvedValue(3)
    emitFromBackground({ kind: 'connection-state', state: 'online' })
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.isInitialLoad).toBe(false)
    await waitFor(() => {
      expect(result.current.items).toHaveLength(3)
    })
    expect(result.current.unreadCount).toBe(3)
    expect(result.current.isRefreshing).toBe(false)
  })

  it('does not refresh on the first state message of the port', async () => {
    await loaded()
    emitFromBackground({ kind: 'connection-state', state: 'online' })
    expect(listNotifications).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the browser goes back online', async () => {
    await loaded()
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => {
      expect(listNotifications).toHaveBeenCalledTimes(2)
    })
  })
})

describe('useNotifications: marking read', () => {
  it('marks one notification read and takes the count from the server', async () => {
    vi.mocked(markNotificationRead).mockResolvedValue(1)
    const { result } = await loaded()
    await act(async () => {
      await result.current.markRead('n2')
    })
    expect(markNotificationRead).toHaveBeenCalledWith('n2')
    expect(result.current.items.find((n) => n.id === 'n2')?.readAt).not.toBe(null)
    expect(result.current.unreadCount).toBe(1)
  })

  it('updates the list at once, before the server answers', async () => {
    vi.mocked(markNotificationRead).mockReturnValue(new Promise(() => undefined))
    const { result } = await loaded()
    act(() => {
      void result.current.markRead('n2')
    })
    expect(result.current.items.find((n) => n.id === 'n2')?.readAt).not.toBe(null)
    expect(result.current.unreadCount).toBe(1)
  })

  it('does not call the server for an already read notification', async () => {
    vi.mocked(listNotifications).mockResolvedValue(pageOf([{ ...N2, readAt: at(5) }, N1], 2))
    vi.mocked(getUnreadCount).mockResolvedValue(1)
    const { result } = await loaded()
    await act(async () => {
      await result.current.markRead('n2')
    })
    expect(markNotificationRead).not.toHaveBeenCalled()
    expect(result.current.unreadCount).toBe(1)
  })

  it('marks all notifications read', async () => {
    vi.mocked(markAllNotificationsRead).mockResolvedValue(0)
    const { result } = await loaded()
    await act(async () => {
      await result.current.markAllRead()
    })
    expect(result.current.items.every((n) => n.readAt !== null)).toBe(true)
    expect(result.current.unreadCount).toBe(0)
  })

  it('reloads the real state when marking read fails', async () => {
    vi.mocked(markAllNotificationsRead).mockRejectedValue(new Error('offline'))
    const { result } = await loaded()
    await act(async () => {
      await result.current.markAllRead()
    })
    await waitFor(() => {
      expect(result.current.unreadCount).toBe(2)
    })
    expect(listNotifications).toHaveBeenCalledTimes(2)
  })
})

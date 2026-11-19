/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/require-await -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError } from './errors'
import * as notificationsApi from './notifications.api'
import type { Notification, NotificationPage, UnreadCount } from './notifications.schema'
import {
  applyNotificationEvent,
  flattenNotifications,
  NOTIFICATIONS_PAGE_SIZE,
  notificationsInfiniteQuery,
  unreadCountQuery,
  useMarkAllNotificationsRead,
  useMarkNotificationRead
} from './notifications.queries'

vi.mock('./notifications.api')

const mk = (id: string, readAt: string | null = null): Notification => ({
  id,
  type: 'task.assigned',
  title: `Уведомление ${id}`,
  body: 'Текст',
  target: { type: 'task', id: `task-${id}` },
  actorId: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  readAt
})

const page = (items: Notification[], pageIndex = 0, total = items.length): NotificationPage => ({
  items,
  total,
  limit: NOTIFICATIONS_PAGE_SIZE,
  page: pageIndex
})

type Pages = InfiniteData<NotificationPage, number>

const LIST_KEY = notificationsInfiniteQuery().queryKey
const COUNT_KEY = unreadCountQuery().queryKey

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

function seed(client: QueryClient, pages: NotificationPage[], unreadCount: number): void {
  client.setQueryData<Pages>(LIST_KEY, { pages, pageParams: pages.map((_, index) => index) })
  client.setQueryData<UnreadCount>(COUNT_KEY, { unreadCount })
}

const listOf = (client: QueryClient): Notification[] => flattenNotifications(client.getQueryData<Pages>(LIST_KEY))
const countOf = (client: QueryClient): number | undefined => client.getQueryData<UnreadCount>(COUNT_KEY)?.unreadCount

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('notificationsInfiniteQuery', () => {
  it('loads the first page and asks for the next one while items remain', async () => {
    vi.mocked(notificationsApi.listNotifications)
      .mockResolvedValueOnce(page([mk('a')], 0, 30))
      .mockResolvedValueOnce(page([mk('b')], 1, 30))
    const { client } = setup()
    const options = notificationsInfiniteQuery()
    expect(options.queryKey).toEqual(['notifications', 'list'])
    await client.fetchInfiniteQuery(options)
    expect(notificationsApi.listNotifications).toHaveBeenCalledWith({ page: 0, limit: NOTIFICATIONS_PAGE_SIZE })
    const data = client.getQueryData<Pages>(LIST_KEY)
    expect(data && options.getNextPageParam(data.pages[0], data.pages, 0, data.pageParams)).toBe(1)
    expect(options.getNextPageParam(page([mk('b')], 1, 30), [], 1, [])).toBeUndefined()
  })
})

describe('unreadCountQuery', () => {
  it('loads the counter', async () => {
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 5 })
    const { client } = setup()
    expect(unreadCountQuery().queryKey).toEqual(['notifications', 'unread-count'])
    await expect(client.fetchQuery(unreadCountQuery())).resolves.toEqual({ unreadCount: 5 })
  })
})

describe('flattenNotifications', () => {
  it('joins pages and keeps one copy of each id', () => {
    const data: Pages = { pages: [page([mk('a'), mk('b')]), page([mk('b'), mk('c')], 1)], pageParams: [0, 1] }
    expect(flattenNotifications(data).map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(flattenNotifications(undefined)).toEqual([])
  })
})

describe('useMarkNotificationRead', () => {
  it('marks the item and decrements the counter before the server answers', async () => {
    const pending = deferred<UnreadCount>()
    vi.mocked(notificationsApi.markNotificationRead).mockReturnValue(pending.promise)
    const { client, wrapper } = setup()
    seed(client, [page([mk('a'), mk('b')])], 2)
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper })
    act(() => { result.current.mutate('a'); })
    await waitFor(() => { expect(listOf(client)[0].readAt).not.toBeNull(); })
    expect(listOf(client)[1].readAt).toBeNull()
    expect(countOf(client)).toBe(1)
    expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('a')
    await act(async () => { pending.resolve({ unreadCount: 7 }); })
    await waitFor(() => { expect(countOf(client)).toBe(7); })
  })

  it('does not decrement for an already read item', async () => {
    vi.mocked(notificationsApi.markNotificationRead).mockReturnValue(new Promise(() => {}))
    const { client, wrapper } = setup()
    seed(client, [page([mk('a', '2026-11-10T10:01:00.000Z')])], 3)
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper })
    act(() => { result.current.mutate('a'); })
    await waitFor(() => { expect(notificationsApi.markNotificationRead).toHaveBeenCalled(); })
    expect(countOf(client)).toBe(3)
    expect(listOf(client)[0].readAt).toBe('2026-11-10T10:01:00.000Z')
  })

  it('rolls the cache back when the server fails', async () => {
    vi.mocked(notificationsApi.markNotificationRead).mockRejectedValue(new BackendError('boom'))
    const { client, wrapper } = setup()
    seed(client, [page([mk('a')])], 1)
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper })
    act(() => { result.current.mutate('a'); })
    await waitFor(() => { expect(result.current.isError).toBe(true); })
    expect(listOf(client)[0].readAt).toBeNull()
    expect(countOf(client)).toBe(1)
  })
})

describe('useMarkAllNotificationsRead', () => {
  it('marks everything read and zeroes the counter right away', async () => {
    const pending = deferred<UnreadCount>()
    vi.mocked(notificationsApi.markAllNotificationsRead).mockReturnValue(pending.promise)
    const { client, wrapper } = setup()
    seed(client, [page([mk('a'), mk('b')]), page([mk('c')], 1)], 3)
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper })
    act(() => { result.current.mutate(); })
    await waitFor(() => { expect(countOf(client)).toBe(0); })
    expect(listOf(client).every((n) => n.readAt !== null)).toBe(true)
    await act(async () => { pending.resolve({ unreadCount: 0 }); })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); })
  })

  it('rolls back when the server fails', async () => {
    vi.mocked(notificationsApi.markAllNotificationsRead).mockRejectedValue(new BackendError('boom'))
    const { client, wrapper } = setup()
    seed(client, [page([mk('a'), mk('b', '2026-11-10T10:01:00.000Z')])], 1)
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper })
    act(() => { result.current.mutate(); })
    await waitFor(() => { expect(result.current.isError).toBe(true); })
    expect(listOf(client).map((n) => n.readAt)).toEqual([null, '2026-11-10T10:01:00.000Z'])
    expect(countOf(client)).toBe(1)
  })
})

describe('applyNotificationEvent', () => {
  it('created puts the notification first and sets the counter', () => {
    const { client } = setup()
    seed(client, [page([mk('a')], 0, 1)], 1)
    applyNotificationEvent(client, { type: 'notification.created', notification: mk('new'), unreadCount: 2 })
    expect(listOf(client).map((n) => n.id)).toEqual(['new', 'a'])
    expect(client.getQueryData<Pages>(LIST_KEY)?.pages[0].total).toBe(2)
    expect(countOf(client)).toBe(2)
  })

  it('created ignores a repeated delivery of the same id', () => {
    const { client } = setup()
    seed(client, [page([mk('a')]), page([mk('b')], 1)], 1)
    applyNotificationEvent(client, { type: 'notification.created', notification: mk('b'), unreadCount: 1 })
    expect(listOf(client).map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('created only sets the counter when the list was never loaded', () => {
    const { client } = setup()
    applyNotificationEvent(client, { type: 'notification.created', notification: mk('a'), unreadCount: 4 })
    expect(client.getQueryData(LIST_KEY)).toBeUndefined()
    expect(countOf(client)).toBe(4)
  })

  it('read marks the listed ids and sets the counter', () => {
    const { client } = setup()
    seed(client, [page([mk('a'), mk('b'), mk('c', '2026-11-10T09:00:00.000Z')])], 2)
    applyNotificationEvent(client, { type: 'notification.read', notificationIds: ['a', 'c'], unreadCount: 1 })
    const [a, b, c] = listOf(client)
    expect(a.readAt).not.toBeNull()
    expect(b.readAt).toBeNull()
    expect(c.readAt).toBe('2026-11-10T09:00:00.000Z')
    expect(countOf(client)).toBe(1)
  })

  it('read all marks every notification and sets the counter', () => {
    const { client } = setup()
    seed(client, [page([mk('a')]), page([mk('b')], 1)], 2)
    applyNotificationEvent(client, { type: 'notification.read', all: true, unreadCount: 0 })
    expect(listOf(client).every((n) => n.readAt !== null)).toBe(true)
    expect(countOf(client)).toBe(0)
  })
})

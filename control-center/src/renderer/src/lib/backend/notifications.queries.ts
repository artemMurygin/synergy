import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient
} from '@tanstack/react-query'
import type { NotificationEventView } from '../../../../preload/notifications-bridge'
import * as notificationsApi from './notifications.api'
import type { Notification, NotificationPage, UnreadCount } from './notifications.schema'

export const NOTIFICATIONS_KEY = ['notifications'] as const
const LIST_KEY = [...NOTIFICATIONS_KEY, 'list'] as const
const UNREAD_COUNT_KEY = [...NOTIFICATIONS_KEY, 'unread-count'] as const

export const NOTIFICATIONS_PAGE_SIZE = 20

export type NotificationEvent = NotificationEventView
type NotificationPages = InfiniteData<NotificationPage, number>

export const notificationsInfiniteQuery = () =>
  infiniteQueryOptions({
    queryKey: LIST_KEY,
    queryFn: ({ pageParam }) => notificationsApi.listNotifications({ page: pageParam, limit: NOTIFICATIONS_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: NotificationPage) =>
      (lastPage.page + 1) * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined
  })

export const unreadCountQuery = () =>
  queryOptions({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => notificationsApi.getUnreadCount()
  })

export function flattenNotifications(data: InfiniteData<NotificationPage, unknown> | undefined): Notification[] {
  if (data === undefined) return []
  const seenIds = new Set<string>()
  const notifications: Notification[] = []
  for (const notificationPage of data.pages) {
    for (const notification of notificationPage.items) {
      if (seenIds.has(notification.id)) continue
      seenIds.add(notification.id)
      notifications.push(notification)
    }
  }
  return notifications
}

const markRead = (notification: Notification, readAt: string): Notification =>
  notification.readAt === null ? { ...notification, readAt } : notification

function updateNotifications(
  queryClient: QueryClient,
  update: (notification: Notification) => Notification
): void {
  queryClient.setQueryData<NotificationPages>(LIST_KEY, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((notificationPage) => ({
            ...notificationPage,
            items: notificationPage.items.map(update)
          }))
        }
      : data
  )
}

function setUnreadCount(queryClient: QueryClient, unreadCount: number): void {
  queryClient.setQueryData<UnreadCount>(UNREAD_COUNT_KEY, { unreadCount })
}

function insertNotification(queryClient: QueryClient, notification: Notification): void {
  queryClient.setQueryData<NotificationPages>(LIST_KEY, (data) => {
    if (data === undefined) return data
    const isKnown = data.pages.some((notificationPage) =>
      notificationPage.items.some((existing) => existing.id === notification.id)
    )
    if (isKnown) return data
    return {
      ...data,
      pages: data.pages.map((notificationPage, index) =>
        index === 0
          ? { ...notificationPage, items: [notification, ...notificationPage.items], total: notificationPage.total + 1 }
          : { ...notificationPage, total: notificationPage.total + 1 }
      )
    }
  })
}

export function applyNotificationEvent(queryClient: QueryClient, event: NotificationEvent): void {
  if (event.type === 'notification.created') {
    insertNotification(queryClient, event.notification)
  } else {
    const readAt = new Date().toISOString()
    if ('all' in event) {
      updateNotifications(queryClient, (notification) => markRead(notification, readAt))
    } else {
      const readIds = new Set(event.notificationIds)
      updateNotifications(queryClient, (notification) =>
        readIds.has(notification.id) ? markRead(notification, readAt) : notification
      )
    }
  }
  setUnreadCount(queryClient, event.unreadCount)
}

interface CacheSnapshot {
  list: NotificationPages | undefined
  unreadCount: UnreadCount | undefined
}

async function takeSnapshot(queryClient: QueryClient): Promise<CacheSnapshot> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: LIST_KEY }),
    queryClient.cancelQueries({ queryKey: UNREAD_COUNT_KEY })
  ])
  return {
    list: queryClient.getQueryData<NotificationPages>(LIST_KEY),
    unreadCount: queryClient.getQueryData<UnreadCount>(UNREAD_COUNT_KEY)
  }
}

function restoreSnapshot(queryClient: QueryClient, snapshot: CacheSnapshot | undefined): void {
  if (snapshot === undefined) return
  queryClient.setQueryData(LIST_KEY, snapshot.list)
  queryClient.setQueryData(UNREAD_COUNT_KEY, snapshot.unreadCount)
}

const isUnreadInCache = (list: NotificationPages | undefined, id: string): boolean =>
  flattenNotifications(list).some((notification) => notification.id === id && notification.readAt === null)

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation<UnreadCount, Error, string, CacheSnapshot>({
    mutationFn: (id) => notificationsApi.markNotificationRead(id),
    onMutate: async (id) => {
      const snapshot = await takeSnapshot(queryClient)
      const readAt = new Date().toISOString()
      updateNotifications(queryClient, (notification) =>
        notification.id === id ? markRead(notification, readAt) : notification
      )
      if (snapshot.unreadCount !== undefined && isUnreadInCache(snapshot.list, id)) {
        setUnreadCount(queryClient, Math.max(0, snapshot.unreadCount.unreadCount - 1))
      }
      return snapshot
    },
    onError: (_error, _id, snapshot) => restoreSnapshot(queryClient, snapshot),
    onSuccess: ({ unreadCount }) => setUnreadCount(queryClient, unreadCount)
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation<UnreadCount, Error, void, CacheSnapshot>({
    mutationFn: () => notificationsApi.markAllNotificationsRead(),
    onMutate: async () => {
      const snapshot = await takeSnapshot(queryClient)
      const readAt = new Date().toISOString()
      updateNotifications(queryClient, (notification) => markRead(notification, readAt))
      setUnreadCount(queryClient, 0)
      return snapshot
    },
    onError: (_error, _variables, snapshot) => restoreSnapshot(queryClient, snapshot),
    onSuccess: ({ unreadCount }) => setUnreadCount(queryClient, unreadCount)
  })
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/shared/notifications/notifications-api'
import type {
  NotificationDto,
  NotificationReadPayload,
} from '@/shared/notifications/notifications-schema'
import type { ConnectionState, PanelMessage } from '@/shared/notifications/panel-protocol'
import { useBackgroundPort } from './use-background-port'

const PAGE_SIZE = 20

export type NotificationsStatus = 'idle' | 'loading' | 'ready' | 'error'
export type LoadMoreStatus = 'idle' | 'loading' | 'error'

export interface NotificationsModel {
  items: NotificationDto[]
  unreadCount: number
  status: NotificationsStatus
  isInitialLoad: boolean
  isRefreshing: boolean
  hasMore: boolean
  loadMoreStatus: LoadMoreStatus
  connectionState: ConnectionState
  toast: NotificationDto | null
  loadMore: () => void
  retry: () => void
  markRead: (notificationId: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismissToast: () => void
}

function mergeUnique(head: readonly NotificationDto[], tail: readonly NotificationDto[]) {
  const ids = new Set(head.map((notification) => notification.id))
  return [...head, ...tail.filter((notification) => !ids.has(notification.id))]
}

function applyRead(
  items: readonly NotificationDto[],
  payload: NotificationReadPayload,
  readAt: string,
): NotificationDto[] {
  const ids = 'all' in payload ? null : new Set(payload.notificationIds)
  return items.map((notification) =>
    notification.readAt === null && (ids === null || ids.has(notification.id))
      ? { ...notification, readAt }
      : notification,
  )
}

export function useNotifications(isEnabled: boolean): NotificationsModel {
  const [items, setItems] = useState<NotificationDto[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<NotificationsStatus>('idle')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadMoreStatus, setLoadMoreStatus] = useState<LoadMoreStatus>('idle')
  const [nextPage, setNextPage] = useState(1)
  const [toast, setToast] = useState<NotificationDto | null>(null)
  const itemsRef = useRef<NotificationDto[]>([])
  const requestRef = useRef(0)
  const previousStateRef = useRef<ConnectionState | null>(null)

  const replaceItems = useCallback((next: NotificationDto[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  const load = useCallback(async () => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const hasItems = itemsRef.current.length > 0
    if (hasItems) setIsRefreshing(true)
    else setStatus('loading')
    try {
      const [page, count] = await Promise.all([
        listNotifications({ page: 0, limit: PAGE_SIZE }),
        getUnreadCount(),
      ])
      if (requestRef.current !== requestId) return
      replaceItems(page.items)
      setTotal(page.total)
      setUnreadCount(count)
      setNextPage(1)
      setLoadMoreStatus('idle')
      setStatus('ready')
    } catch {
      if (requestRef.current !== requestId) return
      setStatus(hasItems ? 'ready' : 'error')
    } finally {
      if (requestRef.current === requestId) setIsRefreshing(false)
    }
  }, [replaceItems])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  const [enabledFor, setEnabledFor] = useState(isEnabled)
  if (enabledFor !== isEnabled) {
    setEnabledFor(isEnabled)
    if (!isEnabled) {
      setItems([])
      setUnreadCount(0)
      setTotal(0)
      setToast(null)
      setIsRefreshing(false)
      setLoadMoreStatus('idle')
      setStatus('idle')
    }
  }

  useEffect(() => {
    if (!isEnabled) {
      requestRef.current += 1
      itemsRef.current = []
      return
    }
    Promise.resolve().then(load, load)
  }, [isEnabled, load])

  useEffect(() => {
    if (!isEnabled) return
    window.addEventListener('online', refresh)
    return () => {
      window.removeEventListener('online', refresh)
    }
  }, [isEnabled, refresh])

  const handleMessage = useCallback(
    (message: PanelMessage) => {
      if (message.kind === 'connection-state') {
        const previous = previousStateRef.current
        previousStateRef.current = message.state
        if (isEnabled && message.state === 'online' && previous !== null && previous !== 'online') {
          refresh()
        }
        return
      }
      if (!isEnabled) return
      const { event } = message
      setUnreadCount(event.payload.unreadCount)
      if (event.type === 'notification.read') {
        replaceItems(applyRead(itemsRef.current, event.payload, new Date().toISOString()))
        return
      }
      const { notification } = event.payload
      if (itemsRef.current.some((existing) => existing.id === notification.id)) return
      replaceItems([notification, ...itemsRef.current])
      setTotal((current) => current + 1)
      setToast(notification)
    },
    [isEnabled, refresh, replaceItems],
  )

  const { connectionState } = useBackgroundPort(handleMessage)

  const loadMore = useCallback(() => {
    if (loadMoreStatus === 'loading') return
    const requestId = requestRef.current
    setLoadMoreStatus('loading')
    listNotifications({ page: nextPage, limit: PAGE_SIZE }).then(
      (page) => {
        if (requestRef.current !== requestId) return
        replaceItems(mergeUnique(itemsRef.current, page.items))
        setTotal(page.total)
        setNextPage(page.page + 1)
        setLoadMoreStatus('idle')
      },
      () => {
        if (requestRef.current === requestId) setLoadMoreStatus('error')
      },
    )
  }, [loadMoreStatus, nextPage, replaceItems])

  const markRead = useCallback(
    async (notificationId: string) => {
      const target = itemsRef.current.find((notification) => notification.id === notificationId)
      if (target !== undefined && target.readAt !== null) return
      if (target !== undefined) {
        replaceItems(
          applyRead(
            itemsRef.current,
            { notificationIds: [notificationId], unreadCount: 0 },
            new Date().toISOString(),
          ),
        )
        setUnreadCount((current) => Math.max(current - 1, 0))
      }
      try {
        setUnreadCount(await markNotificationRead(notificationId))
      } catch {
        await load()
      }
    },
    [load, replaceItems],
  )

  const markAllRead = useCallback(async () => {
    replaceItems(
      applyRead(itemsRef.current, { all: true, unreadCount: 0 }, new Date().toISOString()),
    )
    setUnreadCount(0)
    try {
      setUnreadCount(await markAllNotificationsRead())
    } catch {
      await load()
    }
  }, [load, replaceItems])

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  return {
    items,
    unreadCount,
    status,
    isInitialLoad: (status === 'loading' || status === 'idle') && items.length === 0 && isEnabled,
    isRefreshing,
    hasMore: items.length < total,
    loadMoreStatus,
    connectionState,
    toast,
    loadMore,
    retry: refresh,
    markRead,
    markAllRead,
    dismissToast,
  }
}

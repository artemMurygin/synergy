import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { NotificationsList, type NotificationsListState } from '@synergy/ui-kit'
import { useMemo, type UIEvent } from 'react'
import {
  flattenNotifications,
  notificationsInfiniteQuery,
  unreadCountQuery,
  useMarkAllNotificationsRead
} from '@/lib/backend/notifications.queries'
import type { Notification } from '@/lib/backend/notifications.schema'
import { toNotificationView } from './notification-view'
import { useNotificationsConnection } from './use-notifications-connection'

const LOAD_MORE_THRESHOLD_PX = 80

interface NotificationsPopoverProps {
  onOpenNotification: (notification: Notification) => void
  onClose?: () => void
}

// Data container of the package list: queries and mutations stay here, the list is presentational
export function NotificationsPopover({ onOpenNotification, onClose }: NotificationsPopoverProps) {
  const listQuery = useInfiniteQuery(notificationsInfiniteQuery())
  const unreadQuery = useQuery(unreadCountQuery())
  const markAllRead = useMarkAllNotificationsRead()
  const connection = useNotificationsConnection()
  const unreadCount = unreadQuery.data?.unreadCount ?? 0
  const notifications = flattenNotifications(listQuery.data)
  const items = useMemo(() => notifications.map((notification) => toNotificationView(notification)), [notifications])

  let state: NotificationsListState = 'ready'
  if (listQuery.data === undefined) state = listQuery.isError ? 'error' : 'loading'
  else if (notifications.length === 0) state = 'empty'
  else if (listQuery.isFetchNextPageError && !listQuery.isFetchingNextPage) state = 'error'

  const loadMore = () => {
    if (!listQuery.hasNextPage || listQuery.isFetchingNextPage) return
    void listQuery.fetchNextPage()
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    // the scroll comes from the list inside the capturing wrapper
    if (!(event.target instanceof HTMLElement)) return
    const { scrollTop, clientHeight, scrollHeight } = event.target
    if (scrollTop + clientHeight < scrollHeight - LOAD_MORE_THRESHOLD_PX || listQuery.isFetchNextPageError) return
    loadMore()
  }

  return (
    <div onScrollCapture={handleScroll} className="flex h-[min(660px,calc(100vh-20px))] w-[400px] flex-col">
      <NotificationsList
        items={items}
        state={state}
        connection={connection}
        unreadCount={listQuery.data === undefined ? 0 : unreadCount}
        hasMore={listQuery.hasNextPage}
        loadingMore={listQuery.isFetchingNextPage}
        onOpen={(view) => {
          const notification = notifications.find((candidate) => candidate.id === view.id)
          if (notification) onOpenNotification(notification)
        }}
        onReadAll={() => { markAllRead.mutate(); }}
        onLoadMore={loadMore}
        onRetry={() => void (listQuery.data === undefined ? listQuery.refetch() : listQuery.fetchNextPage())}
        onClose={onClose}
      />
    </div>
  )
}

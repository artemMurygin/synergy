import {
  NotificationsList,
  useLayoutMode,
  type NotificationView,
  type NotificationsListState,
} from '@synergy/ui-kit'
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { NotificationDto } from '@/shared/notifications/notifications-schema'
import { formatRelativeTime } from './format-relative-time'
import type { LoadMoreStatus, NotificationsStatus } from './use-notifications'

interface Props {
  items: NotificationDto[]
  unreadCount: number
  status: NotificationsStatus
  isInitialLoad: boolean
  hasMore: boolean
  loadMoreStatus: LoadMoreStatus
  now?: Date
  anchorRef?: RefObject<HTMLElement | null>
  onOpen: (notification: NotificationDto) => void
  onReadAll: () => void
  onLoadMore: () => void
  onRetry: () => void
  onClose: () => void
}

function listState(props: Props): NotificationsListState {
  if (props.isInitialLoad) return 'loading'
  if (props.status === 'error') return 'error'
  return props.items.length === 0 ? 'empty' : 'ready'
}

/**
 * Notification list over the panel: a popover next to the rail on tablet, the whole panel on
 * mobile (SJ0NJ). The list itself is the package `NotificationsList`.
 */
export function NotificationsOverlay(props: Props) {
  const { items, anchorRef, onClose } = props
  const mode = useLayoutMode()
  const isPopover = mode !== 'mobile'
  const rootRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const now = props.now ?? new Date()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!isPopover) return
    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) === true) return
      if (anchorRef?.current?.contains(target) === true) return
      onCloseRef.current()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isPopover, anchorRef])

  const byId = new Map(items.map((notification) => [notification.id, notification]))
  const views: NotificationView[] = items.map((notification) => ({
    id: notification.id,
    title: notification.title,
    text: notification.body,
    time: formatRelativeTime(notification.createdAt, now, isPopover ? 'full' : 'short'),
    unread: notification.readAt === null,
  }))

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Уведомления"
      tabIndex={-1}
      data-layout={isPopover ? 'dropdown' : 'panel'}
      className={`z-30 flex flex-col overflow-hidden bg-surface outline-none ${
        isPopover
          ? 'fixed bottom-2.5 left-[92px] max-h-[min(560px,calc(100vh-20px))] w-[380px] rounded-xl shadow-[0_12px_32px_var(--color-shadow-card)]'
          : 'absolute inset-0'
      }`}
    >
      <NotificationsList
        items={views}
        state={listState(props)}
        unreadCount={props.unreadCount}
        hasMore={props.hasMore}
        loadingMore={props.loadMoreStatus === 'loading'}
        onOpen={(view) => {
          const notification = byId.get(view.id)
          if (notification !== undefined) props.onOpen(notification)
        }}
        onReadAll={props.onReadAll}
        onLoadMore={props.onLoadMore}
        onRetry={props.onRetry}
        onClose={isPopover ? undefined : onClose}
      />
    </div>
  )
}

import {
  NotificationsList,
  groupByDay,
  notificationIconNode,
  useLayoutMode,
  type NotificationView,
  type NotificationsConnection,
  type NotificationsListState,
} from '@synergy/ui-kit'
import { CheckCheck, ChevronLeft } from '@synergy/ui-kit/icons'
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
  connection?: NotificationsConnection
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

function unreadText(count: number): string {
  if (count === 0) return 'Всё прочитано'
  return count % 10 === 1 && count % 100 !== 11
    ? `${String(count)} непрочитанное`
    : `${String(count)} непрочитанных`
}

function metaText(props: Props): string {
  if (props.connection === 'reconnecting') return 'Переподключение…'
  if (props.isInitialLoad) return 'Загрузка…'
  if (props.status === 'error') return 'Нет связи с сервером'
  return unreadText(props.unreadCount)
}

/** Top bar of the full-screen list on mobile (U5dtI). */
function MobileHeader({ props }: { props: Props }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-3">
      <button
        type="button"
        aria-label="Назад"
        onClick={props.onClose}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
      >
        <ChevronLeft size={20} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col pl-1">
        <h1 className="truncate font-display text-lg leading-tight font-semibold text-ink">
          Уведомления
        </h1>
        <span className="truncate text-[11px] text-ink-60">{metaText(props)}</span>
      </div>
      <button
        type="button"
        disabled={props.unreadCount === 0}
        onClick={props.onReadAll}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[18px] bg-surface-alt px-3.5 text-[13px] font-semibold text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50"
      >
        <CheckCheck size={16} />
        Прочитать все
      </button>
    </header>
  )
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
    group: groupByDay(notification.createdAt, now),
    icon: notificationIconNode(notification.type),
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
      {isPopover ? null : <MobileHeader props={props} />}
      <NotificationsList
        hideHeader={!isPopover}
        connection={props.connection}
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

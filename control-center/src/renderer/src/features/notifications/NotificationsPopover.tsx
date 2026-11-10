import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck, CloudOff, LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode, UIEvent } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  flattenNotifications,
  notificationsInfiniteQuery,
  unreadCountQuery,
  useMarkAllNotificationsRead
} from '@/lib/backend/notifications.queries'
import type { Notification } from '@/lib/backend/notifications.schema'
import { NotificationItem } from './NotificationItem'

const SKELETON_ROWS = 6
const LOAD_MORE_THRESHOLD_PX = 80
const RETRY_BUTTON_CLASS =
  'inline-flex h-10 items-center rounded-full border border-brand-red px-[18px] text-sm font-semibold text-brand-red outline-none hover:bg-brand-red-soft focus-visible:ring-2 focus-visible:ring-ring'

interface NotificationsPopoverProps {
  onOpenNotification: (notification: Notification) => void
}

export function NotificationsPopover({ onOpenNotification }: NotificationsPopoverProps) {
  const listQuery = useInfiniteQuery(notificationsInfiniteQuery())
  const unreadQuery = useQuery(unreadCountQuery())
  const markAllRead = useMarkAllNotificationsRead()
  const unreadCount = unreadQuery.data?.unreadCount ?? 0
  const notifications = flattenNotifications(listQuery.data)
  const hasUnread = listQuery.data !== undefined && unreadCount > 0

  const handleScroll = (event: UIEvent<HTMLUListElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - LOAD_MORE_THRESHOLD_PX
    if (!isNearBottom || !listQuery.hasNextPage || listQuery.isFetchingNextPage || listQuery.isFetchNextPageError) return
    void listQuery.fetchNextPage()
  }

  const renderBody = (): ReactNode => {
    if (listQuery.data === undefined && listQuery.isError) {
      return (
        <CenteredState
          icon={CloudOff}
          title="Не удалось загрузить уведомления"
          caption="Сервер недоступен. Проверьте подключение и повторите попытку"
        >
          <button type="button" className={RETRY_BUTTON_CLASS} onClick={() => void listQuery.refetch()}>
            Повторить
          </button>
        </CenteredState>
      )
    }
    if (listQuery.data === undefined) return <ListSkeleton />
    if (notifications.length === 0) {
      return (
        <CenteredState
          icon={Bell}
          title="Уведомлений пока нет"
          caption="Здесь появятся задачи, которые вам назначат, и другие события"
        />
      )
    }
    return (
      <>
        <ul aria-label="Уведомления" onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <NotificationItem notification={notification} onOpen={onOpenNotification} />
            </li>
          ))}
        </ul>
        {listQuery.isFetchingNextPage ? (
          <div role="status" className="flex h-11 shrink-0 items-center justify-center gap-2 border-t text-[13px] font-medium text-ink-60">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            Загружаем ещё…
          </div>
        ) : null}
        {listQuery.isFetchNextPageError && !listQuery.isFetchingNextPage ? (
          <div role="alert" className="flex h-11 shrink-0 items-center justify-center gap-3 border-t text-[13px] font-medium text-ink-60">
            Не удалось загрузить ещё
            <button
              type="button"
              onClick={() => void listQuery.fetchNextPage()}
              className="rounded-md px-2 py-1 font-semibold text-brand-red outline-none hover:bg-brand-red-soft focus-visible:ring-2 focus-visible:ring-ring"
            >
              Повторить
            </button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="flex h-[min(520px,calc(100vh-24px))] w-[400px] flex-col">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b pr-2 pl-4">
        <h2 className="font-display text-base font-semibold text-foreground">Уведомления</h2>
        {hasUnread ? (
          <span className="inline-flex items-center gap-[5px] rounded-full bg-brand-red-soft px-2 py-[3px] text-[11px] font-semibold text-brand-red">
            <span aria-hidden className="size-1.5 rounded-full bg-brand-red" />
            {`${String(unreadCount)} новых`}
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          disabled={!hasUnread}
          onClick={() => markAllRead.mutate()}
          className="group inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-80 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-ink-40"
        >
          <CheckCheck aria-hidden className="size-4 text-ink-60 group-disabled:text-ink-40" />
          Прочитать все
        </button>
      </header>
      {renderBody()}
    </div>
  )
}

interface CenteredStateProps {
  icon: LucideIcon
  title: string
  caption: string
  children?: ReactNode
}

function CenteredState({ icon: Icon, title, caption, children }: CenteredStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-surface-sunken text-ink-60">
        <Icon aria-hidden className="size-7" />
      </span>
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <p className="max-w-[280px] text-sm text-ink-60">{caption}</p>
      {children}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Загрузка уведомлений" className="min-h-0 flex-1 overflow-hidden">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className="flex items-start gap-3 border-b px-4 py-4">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="h-2.5 w-2/5 rounded-full" />
            <Skeleton className="h-2.5 w-full rounded-full" />
            <Skeleton className="h-2.5 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

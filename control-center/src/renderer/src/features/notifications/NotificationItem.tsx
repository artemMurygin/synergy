import { useId } from 'react'
import { formatRelativeTime } from '@/lib/format-relative-time'
import type { Notification } from '@/lib/backend/notifications.schema'
import { cn } from '@/lib/utils'
import { NotificationIcon } from './NotificationIcon'

interface NotificationItemProps {
  notification: Notification
  onOpen: (notification: Notification) => void
}

export function NotificationItem({ notification, onOpen }: NotificationItemProps) {
  const titleId = useId()
  const bodyId = useId()
  const isUnread = notification.readAt === null

  return (
    <button
      type="button"
      data-unread={isUnread}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClick={() => onOpen(notification)}
      className={cn(
        'flex w-full items-start gap-3 border-b px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isUnread ? 'bg-surface-alt hover:bg-surface-sunken' : 'bg-background hover:bg-surface-alt'
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUnread ? 'bg-brand-red-soft text-brand-red' : 'bg-surface-sunken text-ink-60'
        )}
      >
        <NotificationIcon notification={notification} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span
            id={titleId}
            data-slot="title"
            className={cn(
              'min-w-0 flex-1 truncate text-sm leading-[1.2]',
              isUnread ? 'font-bold text-foreground' : 'font-medium text-ink-80'
            )}
          >
            {notification.title}
          </span>
          <time
            dateTime={notification.createdAt}
            className={cn('shrink-0 text-xs leading-[1.2] font-medium', isUnread ? 'text-ink-60' : 'text-ink-40')}
          >
            {formatRelativeTime(notification.createdAt)}
          </time>
          {isUnread ? (
            <span role="img" aria-label="Не прочитано" className="size-2 shrink-0 rounded-full bg-brand-red" />
          ) : null}
        </span>
        <span
          id={bodyId}
          className={cn('line-clamp-2 text-[13px] leading-[1.4]', isUnread ? 'text-ink-80' : 'text-ink-60')}
        >
          {notification.body}
        </span>
      </span>
    </button>
  )
}

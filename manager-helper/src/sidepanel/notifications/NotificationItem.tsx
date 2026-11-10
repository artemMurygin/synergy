import type { NotificationDto } from '@/shared/notifications/notifications-schema'
import { ListChecksIcon } from '../icons'
import { formatRelativeTime } from './format-relative-time'
import type { RelativeTimeMode } from './format-relative-time'

interface Props {
  notification: NotificationDto
  now: Date
  timeMode: RelativeTimeMode
  onOpen: (notification: NotificationDto) => void
}

export function NotificationItem({ notification, now, timeMode, onOpen }: Props) {
  const isUnread = notification.readAt === null
  return (
    <button
      type="button"
      data-unread={isUnread}
      className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left ${
        isUnread ? 'bg-surface-alt hover:bg-surface-sunken' : 'bg-white hover:bg-surface-alt'
      }`}
      onClick={() => {
        onOpen(notification)
      }}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUnread ? 'bg-brand-red-soft text-brand-red' : 'bg-surface-sunken text-ink-60'
        }`}
      >
        <ListChecksIcon />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              isUnread ? 'font-bold text-ink' : 'font-medium text-ink-80'
            }`}
          >
            {notification.title}
          </span>
          <time
            dateTime={notification.createdAt}
            className={`shrink-0 text-xs font-medium ${isUnread ? 'text-ink-60' : 'text-ink-40'}`}
          >
            {formatRelativeTime(notification.createdAt, now, timeMode)}
          </time>
          {isUnread && (
            <>
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand-red" />
              <span className="sr-only">Не прочитано</span>
            </>
          )}
        </span>
        <span
          className={`line-clamp-2 text-[13px] leading-[1.4] ${
            isUnread ? 'text-ink-80' : 'text-ink-60'
          }`}
        >
          {notification.body}
        </span>
      </span>
    </button>
  )
}

import { X } from 'lucide-react'
import { useId } from 'react'
import type { Notification } from '@/lib/backend/notifications.schema'
import { NotificationIcon } from './NotificationIcon'

const TASK_TARGET = 'task'

interface NotificationToastProps {
  notification: Notification
  onOpen: (notification: Notification) => void
  onDismiss: (id: string) => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
}

export function NotificationToast({
  notification,
  onOpen,
  onDismiss,
  onPointerEnter,
  onPointerLeave
}: NotificationToastProps) {
  const titleId = useId()
  const bodyId = useId()

  return (
    <div
      role="group"
      aria-label={notification.title}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      className="group pointer-events-auto flex w-[360px] items-start gap-3 rounded-md bg-ink py-3.5 pr-3.5 pl-4 text-white shadow-[0_6px_14px_rgba(0,0,0,0.16)] hover:bg-ink-80"
    >
      <button
        type="button"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={() => onOpen(notification)}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.12]">
          <NotificationIcon notification={notification} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={titleId} className="text-sm leading-[1.2] font-semibold">
            {notification.title}
          </span>
          <span id={bodyId} className="line-clamp-3 text-[13px] leading-[1.4] text-white/70">
            {notification.body}
          </span>
          {notification.target.type === TASK_TARGET ? (
            <span className="text-[13px] font-semibold text-brand-red">Открыть задачу</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        aria-label="Закрыть уведомление"
        onClick={() => onDismiss(notification.id)}
        className="-m-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-white/60 outline-none group-hover:text-white hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}

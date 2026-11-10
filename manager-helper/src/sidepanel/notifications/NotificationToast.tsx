import { useEffect, useRef, useState } from 'react'
import type { NotificationDto } from '@/shared/notifications/notifications-schema'
import { CloseIcon, ListChecksIcon } from '../icons'

export const TOAST_TIMEOUT_MS = 6000

interface Props {
  notification: NotificationDto
  onOpen: (notification: NotificationDto) => void
  onDismiss: () => void
}

export function NotificationToast({ notification, onOpen, onDismiss }: Props) {
  const [isPaused, setIsPaused] = useState(false)
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (isPaused) return
    const timer = setTimeout(() => {
      onDismissRef.current()
    }, TOAST_TIMEOUT_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [isPaused, notification.id])

  return (
    <div
      role="status"
      aria-label="Новое уведомление"
      className="absolute inset-x-3 bottom-4 z-40 rounded-xl bg-ink shadow-[0_6px_14px_#00000029]"
      onMouseEnter={() => {
        setIsPaused(true)
      }}
      onMouseLeave={() => {
        setIsPaused(false)
      }}
    >
      <button
        type="button"
        className="flex w-full gap-3 rounded-xl py-3.5 pr-10 pl-4 text-left"
        onClick={() => {
          onOpen(notification)
        }}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-white">
          <ListChecksIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-white">{notification.title}</span>
          <span className="line-clamp-2 text-[13px] leading-[1.4] text-white/70">
            {notification.body}
          </span>
          {notification.target.type === 'task' && (
            <span className="text-[13px] font-semibold text-brand-red">Открыть задачу</span>
          )}
        </span>
      </button>
      <button
        type="button"
        aria-label="Закрыть уведомление"
        className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-md text-white/60 hover:text-white"
        onClick={onDismiss}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

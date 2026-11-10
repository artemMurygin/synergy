import { useNotificationsStore } from '@/stores/notifications.store'
import { NotificationToast } from './NotificationToast'
import { useOpenNotification } from './use-open-notification'

export function NotificationToaster() {
  const toasts = useNotificationsStore((state) => state.toasts)
  const dismiss = useNotificationsStore((state) => state.dismiss)
  const pause = useNotificationsStore((state) => state.pause)
  const resume = useNotificationsStore((state) => state.resume)
  const openNotification = useOpenNotification()

  return (
    <section
      aria-label="Новые уведомления"
      aria-live="polite"
      className="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2"
    >
      {toasts.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onOpen={openNotification}
          onDismiss={dismiss}
          onPointerEnter={() => pause(notification.id)}
          onPointerLeave={() => resume(notification.id)}
        />
      ))}
    </section>
  )
}

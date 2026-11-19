import { NotificationToast } from '@synergy/ui-kit'
import { useNotificationsStore, TOAST_DURATION_MS } from '@/stores/notifications.store'
import { toNotificationView, TOAST_ACTION_LABEL } from './notification-view'
import { useOpenNotification } from './use-open-notification'

// Toasts stack at the bottom right (frame DNt8I); the store owns the hide timers and the hover pause
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
      className="pointer-events-none fixed right-8 bottom-6 z-50 flex flex-col items-end gap-2.5"
    >
      {toasts.map((notification) => {
        const view = toNotificationView(notification)
        return (
          <div
            key={notification.id}
            className="pointer-events-auto"
            onMouseEnter={() => { pause(notification.id); }}
            onMouseLeave={() => { resume(notification.id); }}
          >
            <NotificationToast
              title={view.title}
              text={view.text}
              tone={view.tone}
              icon={view.icon}
              actionLabel={TOAST_ACTION_LABEL[notification.target.type]}
              onAction={() => { openNotification(notification); }}
              onClose={() => { dismiss(notification.id); }}
              duration={TOAST_DURATION_MS}
            />
          </div>
        )
      })}
    </section>
  )
}

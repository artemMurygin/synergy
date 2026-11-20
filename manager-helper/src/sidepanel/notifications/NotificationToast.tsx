import { NotificationToast as Toast, useLayoutMode } from '@synergy/ui-kit'
import type { NotificationDto } from '@/shared/notifications/notifications-schema'

interface Props {
  notification: NotificationDto
  onOpen: (notification: NotificationDto) => void
  onDismiss: () => void
}

const ACTION_LABEL: Record<string, string | undefined> = {
  task: 'Открыть задачу',
  request: 'Открыть заявку',
  chat: 'Открыть чат',
}

/** Toast of a new notification (DNt8I): bottom right on tablet, under the top bar on mobile. */
export function NotificationToast({ notification, onOpen, onDismiss }: Props) {
  const mobile = useLayoutMode() === 'mobile'
  const actionLabel = ACTION_LABEL[notification.target.type]
  return (
    <div
      className={`pointer-events-none absolute z-40 flex ${
        mobile ? 'inset-x-3 top-[72px] justify-center' : 'right-4 bottom-4'
      }`}
    >
      <Toast
        title={notification.title}
        text={notification.body}
        actionLabel={actionLabel}
        onAction={() => {
          onOpen(notification)
        }}
        onClose={onDismiss}
        className="pointer-events-auto"
      />
    </div>
  )
}

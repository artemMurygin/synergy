import { Bell, ListChecks } from 'lucide-react'
import type { Notification } from '@/lib/backend/notifications.schema'

const TASK_TARGET = 'task'

export function NotificationIcon({ notification, className }: { notification: Notification; className?: string }) {
  const Icon = notification.target.type === TASK_TARGET ? ListChecks : Bell
  return <Icon aria-hidden className={className} />
}

import { AlertCircle, Bell, FileAudio, ListChecks } from 'lucide-react'
import {
  MEETING_TRANSCRIPT_FAILED,
  MEETING_TRANSCRIPT_READY,
  NOTIFICATION_TARGET,
  type Notification
} from '@/lib/backend/notifications.schema'

function iconOf(notification: Notification) {
  if (notification.type === MEETING_TRANSCRIPT_READY) return FileAudio
  if (notification.type === MEETING_TRANSCRIPT_FAILED) return AlertCircle
  if (notification.target.type === NOTIFICATION_TARGET.task) return ListChecks
  return Bell
}

export function NotificationIcon({ notification, className }: { notification: Notification; className?: string }) {
  const Icon = iconOf(notification)
  return <Icon aria-hidden className={className} />
}

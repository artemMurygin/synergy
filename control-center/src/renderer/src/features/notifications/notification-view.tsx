import { groupByDay, notificationIconNode, type NotificationView } from '@synergy/ui-kit'
import {
  MEETING_TRANSCRIPT_FAILED,
  MEETING_TRANSCRIPT_READY,
  NOTIFICATION_TARGET,
  type Notification
} from '@/lib/backend/notifications.schema'
import { formatRelativeTime } from '@/lib/format-relative-time'

type Look = Pick<NotificationView, 'tone' | 'icon'>

function lookOf(notification: Notification): Look {
  if (notification.type === MEETING_TRANSCRIPT_READY) return { tone: 'info', icon: notificationIconNode('transcript-ready') }
  if (notification.type === MEETING_TRANSCRIPT_FAILED) return { tone: 'warning', icon: notificationIconNode('error') }
  if (notification.target.type === NOTIFICATION_TARGET.task) return { tone: 'brand', icon: notificationIconNode('task') }
  return { tone: 'brand', icon: notificationIconNode(notification.type) }
}

export function toNotificationView(notification: Notification, now: Date = new Date()): NotificationView {
  return {
    id: notification.id,
    title: notification.title,
    text: notification.body,
    time: formatRelativeTime(notification.createdAt, now),
    unread: notification.readAt === null,
    group: groupByDay(notification.createdAt, now),
    ...lookOf(notification)
  }
}

export const TOAST_ACTION_LABEL: Record<string, string> = {
  [NOTIFICATION_TARGET.task]: 'Открыть задачу',
  [NOTIFICATION_TARGET.chat]: 'Открыть чат',
  [NOTIFICATION_TARGET.request]: 'Открыть заявку'
}

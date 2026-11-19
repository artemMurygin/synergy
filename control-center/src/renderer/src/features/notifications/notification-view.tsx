import { AudioLines, Bell, ListChecks, TriangleAlert } from '@synergy/ui-kit/icons'
import type { NotificationView } from '@synergy/ui-kit'
import {
  MEETING_TRANSCRIPT_FAILED,
  MEETING_TRANSCRIPT_READY,
  NOTIFICATION_TARGET,
  type Notification
} from '@/lib/backend/notifications.schema'
import { formatRelativeTime } from '@/lib/format-relative-time'

type Look = Pick<NotificationView, 'tone' | 'icon'>

function lookOf(notification: Notification): Look {
  if (notification.type === MEETING_TRANSCRIPT_READY) return { tone: 'info', icon: <AudioLines /> }
  if (notification.type === MEETING_TRANSCRIPT_FAILED) return { tone: 'warning', icon: <TriangleAlert /> }
  if (notification.target.type === NOTIFICATION_TARGET.task) return { tone: 'brand', icon: <ListChecks /> }
  return { tone: 'brand', icon: <Bell /> }
}

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const DAY_MS = 86_400_000

export function groupOf(iso: string, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS)
  if (days <= 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  return 'Ранее'
}

export function toNotificationView(notification: Notification, now: Date = new Date()): NotificationView {
  return {
    id: notification.id,
    title: notification.title,
    text: notification.body,
    time: formatRelativeTime(notification.createdAt, now),
    unread: notification.readAt === null,
    group: groupOf(notification.createdAt, now),
    ...lookOf(notification)
  }
}

export const TOAST_ACTION_LABEL: Record<string, string> = {
  [NOTIFICATION_TARGET.task]: 'Открыть задачу',
  [NOTIFICATION_TARGET.chat]: 'Открыть чат',
  [NOTIFICATION_TARGET.request]: 'Открыть заявку'
}

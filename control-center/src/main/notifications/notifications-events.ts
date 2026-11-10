import { z } from 'zod'
import type { NotificationEventView } from '../../preload/notifications-bridge'

export const NOTIFICATION_CREATED = 'notification.created'
export const NOTIFICATION_READ = 'notification.read'
export const NOTIFICATION_EVENT_NAMES = [NOTIFICATION_CREATED, NOTIFICATION_READ] as const

const UnreadCountSchema = z.number().int().min(0)

const NotificationSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string(),
  body: z.string(),
  target: z.object({ type: z.string().min(1), id: z.string().min(1) }),
  actorId: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  readAt: z.iso.datetime({ offset: true }).nullable()
})

const CreatedPayloadSchema = z.object({
  notification: NotificationSchema,
  unreadCount: UnreadCountSchema
})

const ReadPayloadSchema = z.union([
  z.object({ notificationIds: z.array(z.string().min(1)), unreadCount: UnreadCountSchema }),
  z.object({ all: z.literal(true), unreadCount: UnreadCountSchema })
])

export const ConnectionErrorSchema = z.object({
  code: z.enum(['token_invalid', 'token_expired', 'password_change_required', 'origin_not_allowed', 'server_error'])
})

export type ConnectionErrorCode = z.infer<typeof ConnectionErrorSchema>['code']

export function parseNotificationEvent(eventName: string, payload: unknown): NotificationEventView | null {
  if (eventName === NOTIFICATION_CREATED) {
    const parsed = CreatedPayloadSchema.safeParse(payload)
    return parsed.success ? { type: NOTIFICATION_CREATED, ...parsed.data } : null
  }
  if (eventName === NOTIFICATION_READ) {
    const parsed = ReadPayloadSchema.safeParse(payload)
    return parsed.success ? { type: NOTIFICATION_READ, ...parsed.data } : null
  }
  return null
}

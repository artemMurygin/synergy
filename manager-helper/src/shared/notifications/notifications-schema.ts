import { z } from 'zod'

const isoDateTime = z.iso.datetime({ offset: true })

export const notificationTargetSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
})

export const notificationSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string(),
  body: z.string(),
  target: notificationTargetSchema,
  actorId: z.string().nullable(),
  createdAt: isoDateTime,
  readAt: isoDateTime.nullable(),
})

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  page: z.number().int().nonnegative(),
})

const unreadCount = z.number().int().nonnegative()

export const unreadCountSchema = z.object({ unreadCount })

export const notificationCreatedPayloadSchema = z.object({
  notification: notificationSchema,
  unreadCount,
})

export const notificationReadPayloadSchema = z.union([
  z.object({ notificationIds: z.array(z.string().min(1)), unreadCount }),
  z.object({ all: z.literal(true), unreadCount }),
])

export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('notification.created'), payload: notificationCreatedPayloadSchema }),
  z.object({ type: z.literal('notification.read'), payload: notificationReadPayloadSchema }),
])

export const CONNECTION_ERROR_CODES = [
  'token_invalid',
  'token_expired',
  'password_change_required',
  'origin_not_allowed',
  'server_error',
] as const

const connectionErrorPayloadSchema = z.object({ code: z.enum(CONNECTION_ERROR_CODES) })

export type NotificationTarget = z.infer<typeof notificationTargetSchema>
export type NotificationDto = z.infer<typeof notificationSchema>
export type NotificationPage = z.infer<typeof notificationPageSchema>
export type NotificationCreatedPayload = z.infer<typeof notificationCreatedPayloadSchema>
export type NotificationReadPayload = z.infer<typeof notificationReadPayloadSchema>
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>
export type RealtimeEventType = RealtimeEvent['type']
export type ConnectionErrorCode = (typeof CONNECTION_ERROR_CODES)[number]

export const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = [
  'notification.created',
  'notification.read',
]

export function parseRealtimeEvent(eventName: string, payload: unknown): RealtimeEvent | null {
  const parsed = realtimeEventSchema.safeParse({ type: eventName, payload })
  return parsed.success ? parsed.data : null
}

export function parseConnectionErrorCode(payload: unknown): ConnectionErrorCode | null {
  const parsed = connectionErrorPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data.code : null
}

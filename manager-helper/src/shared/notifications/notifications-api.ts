import type { z } from 'zod'
import { errorMessage } from '../api'
import { authFetch } from '../auth/auth-fetch'
import { getBackendUrl } from '../settings'
import { notificationPageSchema, unreadCountSchema } from './notifications-schema'
import type { NotificationPage } from './notifications-schema'

export class NotificationsApiError extends Error {}
export class NotificationNotFoundError extends NotificationsApiError {}

export interface ListNotificationsParams {
  page: number
  limit: number
  unreadOnly?: boolean
}

const UNEXPECTED_FORMAT = 'Сервер вернул ответ в неожиданном формате'

async function request(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await authFetch(`${baseUrl}${path}`, init)
  } catch {
    throw new NotificationsApiError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (response.ok) return response
  const message = await errorMessage(response)
  throw response.status === 404
    ? new NotificationNotFoundError(message)
    : new NotificationsApiError(message)
}

async function parseBody<TOutput>(response: Response, schema: z.ZodType<TOutput>): Promise<TOutput> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new NotificationsApiError(UNEXPECTED_FORMAT)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new NotificationsApiError(UNEXPECTED_FORMAT)
  return parsed.data
}

export async function listNotifications(params: ListNotificationsParams): Promise<NotificationPage> {
  const search = new URLSearchParams({ limit: String(params.limit), page: String(params.page) })
  if (params.unreadOnly === true) search.set('unreadOnly', 'true')
  const response = await request(`/notifications?${search.toString()}`)
  return parseBody(response, notificationPageSchema)
}

export async function getUnreadCount(): Promise<number> {
  const response = await request('/notifications/unread-count')
  return (await parseBody(response, unreadCountSchema)).unreadCount
}

export async function markNotificationRead(notificationId: string): Promise<number> {
  const response = await request(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
  })
  return (await parseBody(response, unreadCountSchema)).unreadCount
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await request('/notifications/read-all', { method: 'POST' })
  return (await parseBody(response, unreadCountSchema)).unreadCount
}

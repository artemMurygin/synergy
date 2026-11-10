import { errorMessage, fetchBackend } from "./client";
import { BackendError, NotificationNotFoundError } from "./errors";
import { parseBody } from "./parse";
import {
  MarkReadResultSchema,
  NotificationPageSchema,
  UnreadCountSchema,
  type NotificationPage,
  type UnreadCount,
} from "./notifications.schema";

export interface NotificationPageQuery {
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetchBackend(path, init);
  if (response.ok) return response;
  const message = await errorMessage(response);
  if (response.status === 404) throw new NotificationNotFoundError(message);
  throw new BackendError(message);
}

export async function listNotifications(query: NotificationPageQuery): Promise<NotificationPage> {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  if (query.unreadOnly === true) params.set("unreadOnly", "true");
  return parseBody(await call(`/notifications?${params.toString()}`), NotificationPageSchema);
}

export async function getUnreadCount(): Promise<UnreadCount> {
  return parseBody(await call("/notifications/unread-count"), UnreadCountSchema);
}

export async function markNotificationRead(id: string): Promise<UnreadCount> {
  return parseBody(
    await call(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
    MarkReadResultSchema,
  );
}

export async function markAllNotificationsRead(): Promise<UnreadCount> {
  return parseBody(await call("/notifications/read-all", { method: "POST" }), MarkReadResultSchema);
}

export type NotificationConnectionState = 'connecting' | 'online' | 'offline'

export interface NotificationTargetView {
  type: string
  id: string
}

export interface NotificationView {
  id: string
  type: string
  title: string
  body: string
  target: NotificationTargetView
  actorId: string | null
  createdAt: string
  readAt: string | null
}

export type NotificationEventView =
  | { type: 'notification.created'; notification: NotificationView; unreadCount: number }
  | { type: 'notification.read'; notificationIds: string[]; unreadCount: number }
  | { type: 'notification.read'; all: true; unreadCount: number }

export interface NotificationsBridge {
  onEvent(listener: (event: NotificationEventView) => void): () => void
  onConnectionState(listener: (state: NotificationConnectionState) => void): () => void
  getConnectionState(): Promise<NotificationConnectionState>
}

export const NOTIFICATIONS_CHANNELS = {
  event: 'notifications:event',
  connectionState: 'notifications:connectionState',
  getConnectionState: 'notifications:getConnectionState'
} as const

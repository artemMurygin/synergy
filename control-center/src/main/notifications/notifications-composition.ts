import { io } from 'socket.io-client'
import type { NotificationsAuthPort, NotificationsSocket } from './notifications-socket'
import { createNotificationsSocket } from './notifications-socket'

export function createNotificationsConnection(backendUrl: string, auth: NotificationsAuthPort): NotificationsSocket {
  return createNotificationsSocket({
    backendUrl,
    auth,
    createClient: (url, options) => io(url, options),
    logger: { warn: (message, fields) => console.warn(`[notifications] ${message}`, fields) }
  })
}

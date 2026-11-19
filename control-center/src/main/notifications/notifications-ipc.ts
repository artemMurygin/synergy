import { NOTIFICATIONS_CHANNELS } from '../../preload/notifications-bridge'
import type { IpcMainPort, WindowPort } from '../auth/interface/auth-ipc'
import type { NotificationsSocket } from './notifications-socket'

export type NotificationsSourcePort = Pick<NotificationsSocket, 'getConnectionState' | 'onEvent' | 'onConnectionState'>

interface NotificationsIpcDependencies {
  ipcMain: IpcMainPort
  socket: NotificationsSourcePort
  getWindows: () => readonly WindowPort[]
}

export function registerNotificationsIpc({ ipcMain, socket, getWindows }: NotificationsIpcDependencies): () => void {
  ipcMain.handle(NOTIFICATIONS_CHANNELS.getConnectionState, () => socket.getConnectionState())

  const broadcast = (channel: string, payload: unknown): void => {
    for (const window of getWindows()) window.webContents.send(channel, payload)
  }

  const unsubscribeEvents = socket.onEvent((event) => { broadcast(NOTIFICATIONS_CHANNELS.event, event); })
  const unsubscribeState = socket.onConnectionState((state) => { broadcast(NOTIFICATIONS_CHANNELS.connectionState, state); })

  return () => {
    unsubscribeEvents()
    unsubscribeState()
  }
}

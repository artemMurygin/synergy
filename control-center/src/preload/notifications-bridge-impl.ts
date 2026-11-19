import {
  NOTIFICATIONS_CHANNELS,
  type NotificationConnectionState,
  type NotificationEventView,
  type NotificationsBridge
} from './notifications-bridge'

type ChannelListener<T> = (event: unknown, payload: T) => void

export interface NotificationsIpcRendererPort {
  invoke<T>(channel: string): Promise<T>
  on<T>(channel: string, listener: ChannelListener<T>): unknown
  removeListener<T>(channel: string, listener: ChannelListener<T>): unknown
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T ties the payload type of the channel to the listener of the caller
function subscribe<T>(ipcRenderer: NotificationsIpcRendererPort, channel: string, listener: (payload: T) => void): () => void {
  const wrapped: ChannelListener<T> = (_event, payload) => { listener(payload); }
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

export function createNotificationsBridge(ipcRenderer: NotificationsIpcRendererPort): NotificationsBridge {
  return {
    onEvent: (listener) => subscribe<NotificationEventView>(ipcRenderer, NOTIFICATIONS_CHANNELS.event, listener),
    onConnectionState: (listener) =>
      subscribe<NotificationConnectionState>(ipcRenderer, NOTIFICATIONS_CHANNELS.connectionState, listener),
    getConnectionState: () => ipcRenderer.invoke<NotificationConnectionState>(NOTIFICATIONS_CHANNELS.getConnectionState)
  }
}

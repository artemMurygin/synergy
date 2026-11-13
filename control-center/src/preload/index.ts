import { contextBridge, ipcRenderer } from 'electron'
import { createAuthBridge } from './auth-bridge-impl'
import { createNotificationsBridge } from './notifications-bridge-impl'
import { createPortalBridge } from './portal-bridge-impl'

const api = {
  platform: process.platform,
  auth: createAuthBridge(ipcRenderer),
  notifications: createNotificationsBridge(ipcRenderer),
  portal: createPortalBridge(ipcRenderer)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

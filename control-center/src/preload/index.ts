import { contextBridge, ipcRenderer } from 'electron'
import { createAuthBridge } from './auth-bridge-impl'

const api = {
  platform: process.platform,
  auth: createAuthBridge(ipcRenderer)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

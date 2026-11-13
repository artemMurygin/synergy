import { PORTAL_CHANNELS, type PortalBridge, type PortalOpenResult } from './portal-bridge'

export interface PortalIpcRendererPort {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>
}

export function createPortalBridge(ipcRenderer: PortalIpcRendererPort): PortalBridge {
  return {
    openRequest: (requestId) => ipcRenderer.invoke<PortalOpenResult>(PORTAL_CHANNELS.openRequest, requestId)
  }
}

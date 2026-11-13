import { PORTAL_CHANNELS, type PortalOpenResult } from '../../preload/portal-bridge'
import type { IpcMainPort } from '../auth/interface/auth-ipc'
import { buildPortalRequestUrl } from './portal-link'

interface PortalIpcDependencies {
  ipcMain: IpcMainPort
  portalUrl: string | null
  openExternal: (url: string) => Promise<void>
}

export function registerPortalIpc({ ipcMain, portalUrl, openExternal }: PortalIpcDependencies): void {
  ipcMain.handle(PORTAL_CHANNELS.openRequest, async (_event, requestId: unknown): Promise<PortalOpenResult> => {
    if (portalUrl === null) return 'unavailable'
    if (typeof requestId !== 'string') return 'invalid'
    const url = buildPortalRequestUrl(portalUrl, requestId)
    if (url === null) return 'invalid'
    try {
      await openExternal(url)
      return 'opened'
    } catch {
      return 'invalid'
    }
  })
}

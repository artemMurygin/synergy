import type { AuthBridge, SessionSnapshotView } from './auth-bridge'

type SessionListener = (event: unknown, snapshot: SessionSnapshotView) => void

export interface IpcRendererPort {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>
  on(channel: string, listener: SessionListener): unknown
  removeListener(channel: string, listener: SessionListener): unknown
}

export function createAuthBridge(ipcRenderer: IpcRendererPort): AuthBridge {
  return {
    login: (login, password) => ipcRenderer.invoke('auth:login', login, password),
    changePassword: (currentPassword, newPassword) =>
      ipcRenderer.invoke('auth:changePassword', currentPassword, newPassword),
    logout: () => ipcRenderer.invoke('auth:logout'),
    retryRestore: () => ipcRenderer.invoke('auth:retryRestore'),
    getState: () => ipcRenderer.invoke('auth:getState'),
    onSessionChanged: (listener) => {
      const wrapped: SessionListener = (_event, snapshot) => listener(snapshot)
      ipcRenderer.on('session:changed', wrapped)
      return () => {
        ipcRenderer.removeListener('session:changed', wrapped)
      }
    }
  }
}

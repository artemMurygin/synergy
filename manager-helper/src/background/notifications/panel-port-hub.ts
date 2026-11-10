import {
  NOTIFICATIONS_PORT_NAME,
  connectionStateMessage,
} from '@/shared/notifications/panel-protocol'
import type { ConnectionState, PanelMessage } from '@/shared/notifications/panel-protocol'

export interface PanelPortHub {
  attach(): () => void
  isPanelOpen(): boolean
  broadcast(message: PanelMessage): void
  setConnectionState(state: ConnectionState): void
}

export function createPanelPortHub(): PanelPortHub {
  const ports = new Set<chrome.runtime.Port>()
  let connectionState: ConnectionState = 'offline'

  function post(port: chrome.runtime.Port, message: PanelMessage): void {
    try {
      port.postMessage(message)
    } catch {
      ports.delete(port)
    }
  }

  function broadcast(message: PanelMessage): void {
    for (const port of [...ports]) post(port, message)
  }

  function handleConnect(port: chrome.runtime.Port): void {
    if (port.name !== NOTIFICATIONS_PORT_NAME) return
    ports.add(port)
    port.onDisconnect.addListener(() => {
      ports.delete(port)
    })
    post(port, connectionStateMessage(connectionState))
  }

  return {
    attach() {
      chrome.runtime.onConnect.addListener(handleConnect)
      return () => {
        chrome.runtime.onConnect.removeListener(handleConnect)
        ports.clear()
      }
    },
    isPanelOpen: () => ports.size > 0,
    broadcast,
    setConnectionState(state) {
      connectionState = state
      broadcast(connectionStateMessage(state))
    },
  }
}

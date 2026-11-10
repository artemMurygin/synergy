import { useEffect, useRef, useState } from 'react'
import { NOTIFICATIONS_PORT_NAME, parsePanelMessage } from '@/shared/notifications/panel-protocol'
import type { ConnectionState, PanelMessage } from '@/shared/notifications/panel-protocol'

const RECONNECT_DELAY_MS = 1000

export function useBackgroundPort(onMessage: (message: PanelMessage) => void): {
  connectionState: ConnectionState
} {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    let port: chrome.runtime.Port | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let isActive = true

    const handleMessage = (raw: unknown): void => {
      const message = parsePanelMessage(raw)
      if (message === null) return
      if (message.kind === 'connection-state') setConnectionState(message.state)
      onMessageRef.current(message)
    }

    const handleDisconnect = (): void => {
      port = null
      if (!isActive) return
      setConnectionState('connecting')
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
    }

    function connect(): void {
      reconnectTimer = null
      try {
        port = chrome.runtime.connect({ name: NOTIFICATIONS_PORT_NAME })
      } catch {
        handleDisconnect()
        return
      }
      port.onMessage.addListener(handleMessage)
      port.onDisconnect.addListener(handleDisconnect)
    }

    connect()
    return () => {
      isActive = false
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      if (port !== null) {
        port.onDisconnect.removeListener(handleDisconnect)
        port.onMessage.removeListener(handleMessage)
        port.disconnect()
      }
    }
  }, [])

  return { connectionState }
}

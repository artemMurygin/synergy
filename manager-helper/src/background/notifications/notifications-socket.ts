import { io } from 'socket.io-client'
import { getAccessToken } from '@/shared/auth/access-token-store'
import { refreshAccessToken } from '@/shared/auth/refresh-coordinator'
import {
  REALTIME_EVENT_TYPES,
  parseConnectionErrorCode,
  parseRealtimeEvent,
} from '@/shared/notifications/notifications-schema'
import type { RealtimeEvent } from '@/shared/notifications/notifications-schema'
import type { ConnectionState } from '@/shared/notifications/panel-protocol'
import { getBackendUrl } from '@/shared/settings'

const NAMESPACE = '/notifications'

export interface SocketOptions {
  transports: string[]
  auth: (callback: (handshake: { token?: string }) => void) => void
}

export interface SocketLike {
  readonly connected: boolean
  readonly active: boolean
  on(eventName: string, handler: (...args: unknown[]) => void): unknown
  off(): unknown
  connect(): unknown
  disconnect(): unknown
}

export type OpenSocket = (url: string, options: SocketOptions) => SocketLike

export const openSocketIo: OpenSocket = (url, options) => io(url, options)

export interface NotificationsSocketHandlers {
  onEvent: (event: RealtimeEvent) => void
  onStateChange: (state: ConnectionState) => void
  onConnected: () => void
}

export interface NotificationsSocket {
  connect(): Promise<void>
  disconnect(): void
  isAlive(): boolean
}

async function handshakeToken(): Promise<string> {
  return getAccessToken() ?? (await refreshAccessToken()).accessToken
}

export function createNotificationsSocket(
  handlers: NotificationsSocketHandlers,
  openSocket: OpenSocket = openSocketIo,
): NotificationsSocket {
  let socket: SocketLike | null = null
  let renewal: Promise<boolean> | null = null

  function startRenewal(): void {
    renewal ??= refreshAccessToken().then(
      () => true,
      (error: unknown) => {
        console.warn('Notifications token refresh failed', error)
        return false
      },
    )
  }

  async function reconnectAfterRenewal(current: SocketLike): Promise<void> {
    const pending = renewal
    if (pending === null) return
    renewal = null
    const isRenewed = await pending
    if (isRenewed && socket === current && !current.connected) {
      handlers.onStateChange('connecting')
      current.connect()
    }
  }

  function reportDisconnected(current: SocketLike): void {
    if (socket !== current) return
    handlers.onStateChange(current.active ? 'connecting' : 'offline')
  }

  function listen(current: SocketLike): void {
    current.on('connect', () => {
      handlers.onStateChange('online')
      handlers.onConnected()
    })
    current.on('disconnect', () => {
      reportDisconnected(current)
      if (renewal !== null && !current.active) void reconnectAfterRenewal(current)
    })
    current.on('connect_error', () => {
      reportDisconnected(current)
    })
    current.on('connection_error', (payload: unknown) => {
      if (parseConnectionErrorCode(payload) !== 'token_expired') return
      startRenewal()
      if (!current.connected && !current.active) void reconnectAfterRenewal(current)
    })
    current.on('auth_expired', () => {
      startRenewal()
      if (!current.connected && !current.active) void reconnectAfterRenewal(current)
    })
    for (const eventName of REALTIME_EVENT_TYPES) {
      current.on(eventName, (payload: unknown) => {
        const event = parseRealtimeEvent(eventName, payload)
        if (event === null) {
          console.warn('Malformed notifications event', { eventName })
          return
        }
        handlers.onEvent(event)
      })
    }
  }

  let opening: Promise<void> | null = null
  let generation = 0

  async function open(): Promise<void> {
    const startedGeneration = generation
    const baseUrl = await getBackendUrl()
    if (startedGeneration !== generation) return
    handlers.onStateChange('connecting')
    const created = openSocket(`${baseUrl}${NAMESPACE}`, {
      transports: ['websocket'],
      auth: (callback) => {
        handshakeToken().then(
          (token) => {
            callback({ token })
          },
          () => {
            callback({})
          },
        )
      },
    })
    socket = created
    listen(created)
  }

  return {
    async connect() {
      if (socket !== null) {
        if (!socket.connected && !socket.active) {
          handlers.onStateChange('connecting')
          socket.connect()
        }
        return
      }
      opening ??= open().finally(() => {
        opening = null
      })
      await opening
    },
    disconnect() {
      generation += 1
      const current = socket
      socket = null
      renewal = null
      if (current !== null) {
        current.off()
        current.disconnect()
      }
      handlers.onStateChange('offline')
    },
    isAlive: () => socket !== null && (socket.connected || socket.active),
  }
}

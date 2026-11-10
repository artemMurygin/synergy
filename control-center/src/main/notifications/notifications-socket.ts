import type { SessionSnapshot } from '../auth/domain/session-snapshot'
import type { NotificationConnectionState, NotificationEventView } from '../../preload/notifications-bridge'
import { ConnectionErrorSchema, NOTIFICATION_EVENT_NAMES, parseNotificationEvent, type ConnectionErrorCode } from './notifications-events'

const NAMESPACE = '/notifications'
const DEFAULT_RETRY_DELAY_MS = 5_000
const SERVER_DISCONNECT = 'io server disconnect'
const TERMINAL_CODES: readonly ConnectionErrorCode[] = ['token_invalid', 'password_change_required', 'origin_not_allowed']

export interface NotificationsAuthPort {
  getAccessToken(): Promise<string | null>
  refresh(): Promise<{ value: string }>
  getSnapshot(): SessionSnapshot
  onChange(listener: (snapshot: SessionSnapshot) => void): () => void
}

type SocketHandler = (...args: never[]) => void

export interface SocketClientPort {
  on(event: string, handler: SocketHandler): unknown
  connect(): unknown
  disconnect(): unknown
  io: { on(event: 'reconnect_attempt', handler: () => void): unknown }
}

export interface SocketClientOptions {
  transports: string[]
  autoConnect: false
  auth: (callback: (credentials: { token?: string }) => void) => void
}

export type SocketClientFactory = (url: string, options: SocketClientOptions) => SocketClientPort

export interface NotificationsLoggerPort {
  warn(message: string, fields: Record<string, unknown>): void
}

export interface NotificationsSocketDependencies {
  backendUrl: string
  auth: NotificationsAuthPort
  createClient: SocketClientFactory
  logger: NotificationsLoggerPort
  retryDelayMs?: number
}

export interface NotificationsSocket {
  getConnectionState(): NotificationConnectionState
  onEvent(listener: (event: NotificationEventView) => void): () => void
  onConnectionState(listener: (state: NotificationConnectionState) => void): () => void
  dispose(): void
}

interface Connection {
  userId: string | null
  client: SocketClientPort
  lastErrorCode: ConnectionErrorCode | null
  isTokenUnavailable: boolean
  mustRefreshToken: boolean
  retryTimer: ReturnType<typeof setTimeout> | null
}

export function createNotificationsSocket(dependencies: NotificationsSocketDependencies): NotificationsSocket {
  const { backendUrl, auth, createClient, logger } = dependencies
  const retryDelayMs = dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const eventListeners = new Set<(event: NotificationEventView) => void>()
  const stateListeners = new Set<(state: NotificationConnectionState) => void>()
  let state: NotificationConnectionState = 'offline'
  let connection: Connection | null = null

  const setState = (next: NotificationConnectionState): void => {
    if (next === state) return
    state = next
    for (const listener of stateListeners) listener(next)
  }

  const isCurrent = (candidate: Connection): boolean => connection === candidate

  const handleServerDisconnect = (current: Connection): void => {
    const code = current.lastErrorCode
    current.lastErrorCode = null
    if (code !== null && TERMINAL_CODES.includes(code)) {
      if (current.isTokenUnavailable) {
        current.isTokenUnavailable = false
        setState('connecting')
        current.retryTimer = setTimeout(() => {
          current.retryTimer = null
          if (isCurrent(current)) current.client.connect()
        }, retryDelayMs)
        return
      }
      setState('offline')
      return
    }
    setState('connecting')
    current.client.connect()
  }

  const open = (userId: string | null): void => {
    const current: Connection = {
      userId,
      client: createClient(`${backendUrl}${NAMESPACE}`, {
        transports: ['websocket'],
        autoConnect: false,
        auth: (callback) => {
          const mustRefresh = current.mustRefreshToken
          current.mustRefreshToken = false
          const token = mustRefresh ? auth.refresh().then((refreshed) => refreshed.value) : auth.getAccessToken()
          token.then(
            (token) => {
              current.isTokenUnavailable = false
              callback(token === null ? {} : { token })
            },
            () => {
              current.isTokenUnavailable = true
              callback({})
            }
          )
        }
      }),
      lastErrorCode: null,
      isTokenUnavailable: false,
      mustRefreshToken: false,
      retryTimer: null
    }
    connection = current
    const { client } = current

    client.on('connect', () => {
      if (isCurrent(current)) setState('online')
    })
    client.on('connect_error', () => {
      if (isCurrent(current)) setState('connecting')
    })
    client.on('disconnect', (reason: string) => {
      if (!isCurrent(current)) return
      if (reason === SERVER_DISCONNECT) {
        handleServerDisconnect(current)
        return
      }
      setState('connecting')
    })
    client.io.on('reconnect_attempt', () => {
      if (isCurrent(current)) setState('connecting')
    })
    client.on('connection_error', (payload: unknown) => {
      if (!isCurrent(current)) return
      const parsed = ConnectionErrorSchema.safeParse(payload)
      current.lastErrorCode = parsed.success ? parsed.data.code : null
      if (current.lastErrorCode === 'token_expired') current.mustRefreshToken = true
      logger.warn('Notifications connection rejected', { code: current.lastErrorCode ?? 'unknown' })
    })
    client.on('auth_expired', () => {
      if (!isCurrent(current)) return
      current.lastErrorCode = null
      current.mustRefreshToken = true
    })
    for (const eventName of NOTIFICATION_EVENT_NAMES) {
      client.on(eventName, (payload: unknown) => {
        if (!isCurrent(current)) return
        const event = parseNotificationEvent(eventName, payload)
        if (event === null) {
          logger.warn('Notification event dropped', { eventName })
          return
        }
        for (const listener of eventListeners) listener(event)
      })
    }

    setState('connecting')
    client.connect()
  }

  const close = (): void => {
    const current = connection
    if (current === null) return
    connection = null
    if (current.retryTimer !== null) clearTimeout(current.retryTimer)
    current.client.disconnect()
    setState('offline')
  }

  const follow = (snapshot: SessionSnapshot): void => {
    if (snapshot.state !== 'authenticated') {
      close()
      return
    }
    const userId = snapshot.user?.id ?? null
    if (connection !== null && connection.userId === userId) return
    close()
    open(userId)
  }

  const unsubscribeAuth = auth.onChange(follow)
  follow(auth.getSnapshot())

  return {
    getConnectionState: () => state,
    onEvent: (listener) => {
      eventListeners.add(listener)
      return () => {
        eventListeners.delete(listener)
      }
    },
    onConnectionState: (listener) => {
      stateListeners.add(listener)
      return () => {
        stateListeners.delete(listener)
      }
    },
    dispose: () => {
      unsubscribeAuth()
      close()
    }
  }
}

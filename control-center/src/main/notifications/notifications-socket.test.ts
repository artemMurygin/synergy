import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from '../auth/domain/session-snapshot'
import {
  createNotificationsSocket,
  type NotificationsAuthPort,
  type SocketClientOptions,
  type SocketClientPort
} from './notifications-socket'

const BACKEND = 'http://localhost:3000'
const AUTHENTICATED: SessionSnapshot = { state: 'authenticated', user: { id: 'u1', login: 'anna' } }
const UNAUTHENTICATED: SessionSnapshot = { state: 'unauthenticated', user: null }

const notification = {
  id: 'n1',
  type: 'task.assigned',
  title: 'Новая задача',
  body: 'Текст',
  target: { type: 'task', id: 't1' },
  actorId: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  readAt: null
}

type Handler = (...args: unknown[]) => void

function createFakeClient() {
  const handlers = new Map<string, Handler[]>()
  const managerHandlers = new Map<string, Handler[]>()
  const add = (map: Map<string, Handler[]>, event: string, handler: Handler): void => {
    map.set(event, [...(map.get(event) ?? []), handler])
  }
  const client = {
    on: vi.fn((event: string, handler: Handler) => add(handlers, event, handler)),
    connect: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn((event: string, handler: Handler) => add(managerHandlers, event, handler)) }
  } satisfies SocketClientPort
  return {
    client,
    emit: (event: string, ...args: unknown[]) => handlers.get(event)?.forEach((handler) => handler(...args)),
    emitManager: (event: string, ...args: unknown[]) =>
      managerHandlers.get(event)?.forEach((handler) => handler(...args))
  }
}

function createFakeAuth(initial: SessionSnapshot = UNAUTHENTICATED) {
  const listeners = new Set<(snapshot: SessionSnapshot) => void>()
  let snapshot = initial
  const auth = {
    getAccessToken: vi.fn<NotificationsAuthPort['getAccessToken']>().mockResolvedValue('access-1'),
    refresh: vi.fn<NotificationsAuthPort['refresh']>().mockResolvedValue({ value: 'access-refreshed' }),
    getSnapshot: vi.fn(() => snapshot),
    onChange: vi.fn((listener: (next: SessionSnapshot) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    })
  } satisfies NotificationsAuthPort
  return {
    auth,
    setSnapshot(next: SessionSnapshot): void {
      snapshot = next
      listeners.forEach((listener) => listener(next))
    },
    listenerCount: () => listeners.size
  }
}

function setup(initial: SessionSnapshot = UNAUTHENTICATED) {
  const fakes: ReturnType<typeof createFakeClient>[] = []
  const options: { url: string; options: SocketClientOptions }[] = []
  const createClient = vi.fn((url: string, clientOptions: SocketClientOptions) => {
    const fake = createFakeClient()
    fakes.push(fake)
    options.push({ url, options: clientOptions })
    return fake.client
  })
  const session = createFakeAuth(initial)
  const logger = { warn: vi.fn() }
  const socket = createNotificationsSocket({
    backendUrl: BACKEND,
    auth: session.auth,
    createClient,
    logger,
    retryDelayMs: 5_000
  })
  const states: string[] = []
  socket.onConnectionState((state) => states.push(state))
  const latest = () => {
    const fake = fakes.at(-1)
    if (fake === undefined) throw new Error('no client created')
    return fake
  }
  return { socket, session, createClient, fakes, options, logger, states, latest }
}

async function resolveAuth(options: SocketClientOptions): Promise<unknown> {
  return new Promise((resolve) => options.auth(resolve))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createNotificationsSocket', () => {
  it('stays offline while the session is not authenticated', () => {
    const { socket, createClient } = setup()
    expect(createClient).not.toHaveBeenCalled()
    expect(socket.getConnectionState()).toBe('offline')
  })

  it('connects over websocket only when the session becomes authenticated', () => {
    const { session, createClient, options, latest, socket, states } = setup()
    session.setSnapshot(AUTHENTICATED)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(options[0].url).toBe(`${BACKEND}/notifications`)
    expect(options[0].options.transports).toEqual(['websocket'])
    expect(options[0].options.autoConnect).toBe(false)
    expect(latest().client.connect).toHaveBeenCalledTimes(1)
    expect(socket.getConnectionState()).toBe('connecting')
    expect(states).toEqual(['connecting'])
  })

  it('connects right away when the session is already authenticated', () => {
    const { createClient } = setup(AUTHENTICATED)
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('does not open a second connection on repeated authenticated snapshots', () => {
    const { session, createClient } = setup()
    session.setSnapshot(AUTHENTICATED)
    session.setSnapshot({ ...AUTHENTICATED, warning: 'vault' })
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('reports online after connect', () => {
    const { session, latest, socket, states } = setup()
    session.setSnapshot(AUTHENTICATED)
    latest().emit('connect')
    expect(socket.getConnectionState()).toBe('online')
    expect(states).toEqual(['connecting', 'online'])
  })

  it.each([UNAUTHENTICATED, { state: 'mustChangePassword' as const, user: AUTHENTICATED.user }])(
    'disconnects on %o',
    (snapshot) => {
      const { session, latest, socket, states } = setup()
      session.setSnapshot(AUTHENTICATED)
      latest().emit('connect')
      session.setSnapshot(snapshot)
      expect(latest().client.disconnect).toHaveBeenCalledTimes(1)
      expect(socket.getConnectionState()).toBe('offline')
      expect(states).toEqual(['connecting', 'online', 'offline'])
    }
  )

  it('reconnects when the authenticated session switches to another user', () => {
    const { session, createClient, fakes } = setup()
    session.setSnapshot(AUTHENTICATED)
    session.setSnapshot({ state: 'authenticated', user: { id: 'u2', login: 'boris' } })
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(fakes[0].client.disconnect).toHaveBeenCalledTimes(1)
    expect(fakes[1].client.connect).toHaveBeenCalledTimes(1)
  })

  it('opens a new connection after logging in again', () => {
    const { session, createClient } = setup()
    session.setSnapshot(AUTHENTICATED)
    session.setSnapshot(UNAUTHENTICATED)
    session.setSnapshot(AUTHENTICATED)
    expect(createClient).toHaveBeenCalledTimes(2)
  })

  it('takes a fresh token for every connection attempt', async () => {
    const { session, options } = setup()
    session.setSnapshot(AUTHENTICATED)
    session.auth.getAccessToken.mockResolvedValueOnce('access-1').mockResolvedValueOnce('access-2')
    await expect(resolveAuth(options[0].options)).resolves.toEqual({ token: 'access-1' })
    await expect(resolveAuth(options[0].options)).resolves.toEqual({ token: 'access-2' })
    expect(session.auth.getAccessToken).toHaveBeenCalledTimes(2)
  })

  it('sends no token when the session has none', async () => {
    const { session, options } = setup()
    session.setSnapshot(AUTHENTICATED)
    session.auth.getAccessToken.mockResolvedValueOnce(null)
    await expect(resolveAuth(options[0].options)).resolves.toEqual({})
  })

  it('forwards valid server events to listeners', () => {
    const { session, socket, latest } = setup()
    const listener = vi.fn()
    socket.onEvent(listener)
    session.setSnapshot(AUTHENTICATED)
    latest().emit('notification.created', { notification, unreadCount: 2 })
    latest().emit('notification.read', { all: true, unreadCount: 0 })
    expect(listener.mock.calls).toEqual([
      [{ type: 'notification.created', notification, unreadCount: 2 }],
      [{ type: 'notification.read', all: true, unreadCount: 0 }]
    ])
  })

  it('drops an invalid event and logs it without the payload', () => {
    const { session, socket, latest, logger } = setup()
    const listener = vi.fn()
    socket.onEvent(listener)
    session.setSnapshot(AUTHENTICATED)
    latest().emit('notification.created', { notification: { id: 'secret-body' }, unreadCount: 1 })
    expect(listener).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(logger.warn.mock.calls)).toContain('notification.created')
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret-body')
  })

  it('stops delivering events to an unsubscribed listener', () => {
    const { session, socket, latest } = setup()
    const listener = vi.fn()
    const unsubscribe = socket.onEvent(listener)
    session.setSnapshot(AUTHENTICATED)
    unsubscribe()
    latest().emit('notification.read', { all: true, unreadCount: 0 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('shows connecting while socket.io reconnects after a network drop', () => {
    const { session, latest, socket } = setup()
    session.setSnapshot(AUTHENTICATED)
    latest().emit('connect')
    latest().emit('disconnect', 'transport close')
    expect(socket.getConnectionState()).toBe('connecting')
    latest().emitManager('reconnect_attempt', 1)
    expect(socket.getConnectionState()).toBe('connecting')
    expect(latest().client.connect).toHaveBeenCalledTimes(1)
  })

  it('stays connecting on a connect error', () => {
    const { session, latest, socket } = setup()
    session.setSnapshot(AUTHENTICATED)
    latest().emit('connect_error', new Error('ECONNREFUSED'))
    expect(socket.getConnectionState()).toBe('connecting')
  })

  it.each([
    ['auth_expired', 'auth_expired', undefined],
    ['token_expired', 'connection_error', { code: 'token_expired' }]
  ])('reconnects with a fresh token after %s', (_name, event, payload) => {
    const { session, latest, socket } = setup()
    session.setSnapshot(AUTHENTICATED)
    latest().emit('connect')
    latest().emit(event, payload)
    latest().emit('disconnect', 'io server disconnect')
    expect(latest().client.connect).toHaveBeenCalledTimes(2)
    expect(socket.getConnectionState()).toBe('connecting')
  })

  it.each([
    ['auth_expired', 'auth_expired', undefined],
    ['token_expired', 'connection_error', { code: 'token_expired' }]
  ])('forces a token refresh for the reconnect after %s', async (_name, event, payload) => {
    const { session, latest, options } = setup()
    session.setSnapshot(AUTHENTICATED)
    await resolveAuth(options[0].options)
    latest().emit('connect')
    latest().emit(event, payload)
    latest().emit('disconnect', 'io server disconnect')
    await expect(resolveAuth(options[0].options)).resolves.toEqual({ token: 'access-refreshed' })
    expect(session.auth.refresh).toHaveBeenCalledTimes(1)
    expect(session.auth.getAccessToken).toHaveBeenCalledTimes(1)
    await expect(resolveAuth(options[0].options)).resolves.toEqual({ token: 'access-1' })
    expect(session.auth.refresh).toHaveBeenCalledTimes(1)
  })

  it('retries later when the forced refresh fails', async () => {
    vi.useFakeTimers()
    const { session, latest, options } = setup()
    session.setSnapshot(AUTHENTICATED)
    session.auth.refresh.mockRejectedValueOnce(new Error('network'))
    latest().emit('connection_error', { code: 'token_expired' })
    latest().emit('disconnect', 'io server disconnect')
    await expect(resolveAuth(options[0].options)).resolves.toEqual({})
    latest().emit('connection_error', { code: 'token_invalid' })
    latest().emit('disconnect', 'io server disconnect')
    expect(latest().client.connect).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(5_000)
    expect(latest().client.connect).toHaveBeenCalledTimes(3)
  })

  it.each(['token_invalid', 'password_change_required', 'origin_not_allowed'])(
    'stays offline after the server rejects with %s',
    (code) => {
      const { session, latest, socket, logger } = setup()
      session.setSnapshot(AUTHENTICATED)
      latest().emit('connection_error', { code })
      latest().emit('disconnect', 'io server disconnect')
      expect(latest().client.connect).toHaveBeenCalledTimes(1)
      expect(socket.getConnectionState()).toBe('offline')
      expect(JSON.stringify(logger.warn.mock.calls)).toContain(code)
    }
  )

  it('retries later when the token could not be obtained', async () => {
    vi.useFakeTimers()
    const { session, latest, options } = setup()
    session.setSnapshot(AUTHENTICATED)
    session.auth.getAccessToken.mockRejectedValueOnce(new Error('network'))
    await expect(resolveAuth(options[0].options)).resolves.toEqual({})
    latest().emit('connection_error', { code: 'token_invalid' })
    latest().emit('disconnect', 'io server disconnect')
    expect(latest().client.connect).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_000)
    expect(latest().client.connect).toHaveBeenCalledTimes(2)
  })

  it('does not retry after logout', async () => {
    vi.useFakeTimers()
    const { session, latest, options } = setup()
    session.setSnapshot(AUTHENTICATED)
    session.auth.getAccessToken.mockRejectedValueOnce(new Error('network'))
    await resolveAuth(options[0].options)
    latest().emit('connection_error', { code: 'token_invalid' })
    latest().emit('disconnect', 'io server disconnect')
    session.setSnapshot(UNAUTHENTICATED)
    vi.advanceTimersByTime(5_000)
    expect(latest().client.connect).toHaveBeenCalledTimes(1)
  })

  it('ignores events of a closed connection', () => {
    const { session, latest, socket } = setup()
    const listener = vi.fn()
    socket.onEvent(listener)
    session.setSnapshot(AUTHENTICATED)
    const closed = latest()
    session.setSnapshot(UNAUTHENTICATED)
    closed.emit('connect')
    closed.emit('notification.read', { all: true, unreadCount: 0 })
    expect(socket.getConnectionState()).toBe('offline')
    expect(listener).not.toHaveBeenCalled()
  })

  it('dispose closes the connection and stops following the session', () => {
    const { session, latest, socket, createClient } = setup()
    session.setSnapshot(AUTHENTICATED)
    socket.dispose()
    expect(latest().client.disconnect).toHaveBeenCalledTimes(1)
    expect(session.listenerCount()).toBe(0)
    session.setSnapshot(AUTHENTICATED)
    expect(createClient).toHaveBeenCalledTimes(1)
  })
})

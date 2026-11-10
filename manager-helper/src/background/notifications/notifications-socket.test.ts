import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'
import { clearAccessToken, setAccessToken } from '@/shared/auth/access-token-store'
import { refreshAccessToken } from '@/shared/auth/refresh-coordinator'
import { FakeSocket } from './fake-socket.testing'
import { makeNotification } from './chrome-fake.testing'
import { createNotificationsSocket, openSocketIo } from './notifications-socket'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))
vi.mock('@/shared/auth/refresh-coordinator', () => ({ refreshAccessToken: vi.fn() }))
vi.mock('@/shared/settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

let sockets: FakeSocket[]

function lastSocket(): FakeSocket {
  const socket = sockets.at(-1)
  if (socket === undefined) throw new Error('io was not called')
  return socket
}

function setup() {
  const onEvent = vi.fn()
  const onStateChange = vi.fn()
  const onConnected = vi.fn()
  const socket = createNotificationsSocket(
    { onEvent, onStateChange, onConnected },
    (url, options) => {
      const created = new FakeSocket(url, options)
      sockets.push(created)
      return created
    },
  )
  return { socket, onEvent, onStateChange, onConnected }
}

beforeEach(() => {
  sockets = []
  vi.mocked(refreshAccessToken).mockImplementation(() => {
    setAccessToken('fresh')
    return Promise.resolve({ accessToken: 'fresh', expiresIn: 900, mustChangePassword: false })
  })
})
afterEach(() => {
  vi.useRealTimers()
  clearAccessToken()
})

describe('notifications-socket', () => {
  it('opens socket.io connections over websocket only', () => {
    const auth = vi.fn()
    openSocketIo('http://api.test/notifications', { transports: ['websocket'], auth })
    expect(io).toHaveBeenCalledWith('http://api.test/notifications', {
      transports: ['websocket'],
      auth,
    })
  })

  it('connects to the /notifications namespace over websocket only', async () => {
    setAccessToken('tok')
    const { socket } = setup()
    await socket.connect()
    expect(sockets).toHaveLength(1)
    expect(lastSocket().url).toBe('http://api.test/notifications')
    expect(lastSocket().options.transports).toEqual(['websocket'])
  })

  it('sends the current access token in the handshake auth', async () => {
    setAccessToken('tok')
    const { socket } = setup()
    await socket.connect()
    expect(await lastSocket().resolveAuth()).toEqual({ token: 'tok' })
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('refreshes the token for the handshake when there is none', async () => {
    const { socket } = setup()
    await socket.connect()
    expect(await lastSocket().resolveAuth()).toEqual({ token: 'fresh' })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('reports the connection state and the established connection', async () => {
    setAccessToken('tok')
    const { socket, onStateChange, onConnected } = setup()
    await socket.connect()
    expect(onStateChange).toHaveBeenLastCalledWith('connecting')
    lastSocket().simulateConnect()
    expect(onStateChange).toHaveBeenLastCalledWith('online')
    expect(onConnected).toHaveBeenCalledTimes(1)
    expect(socket.isAlive()).toBe(true)
    lastSocket().simulateTransportClose()
    expect(onStateChange).toHaveBeenLastCalledWith('connecting')
  })

  it('forwards valid realtime events and drops malformed ones', async () => {
    setAccessToken('tok')
    const { socket, onEvent } = setup()
    await socket.connect()
    const notification = makeNotification('n1', '2026-11-10T09:00:00.000Z')
    lastSocket().emit('notification.created', { notification, unreadCount: 2 })
    lastSocket().emit('notification.read', { all: true, unreadCount: 0 })
    lastSocket().emit('notification.created', { unreadCount: 2 })
    expect(onEvent.mock.calls).toEqual([
      [{ type: 'notification.created', payload: { notification, unreadCount: 2 } }],
      [{ type: 'notification.read', payload: { all: true, unreadCount: 0 } }],
    ])
  })

  it('reconnects with a refreshed token after auth_expired', async () => {
    setAccessToken('old')
    const { socket } = setup()
    await socket.connect()
    const current = lastSocket()
    current.simulateConnect()
    current.emit('auth_expired')
    current.simulateServerDisconnect()
    await vi.waitFor(() => {
      expect(current.connectCalls).toBe(1)
    })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(await current.resolveAuth()).toEqual({ token: 'fresh' })
  })

  it('reconnects with a refreshed token after a token_expired rejection', async () => {
    setAccessToken('old')
    const { socket } = setup()
    await socket.connect()
    const current = lastSocket()
    current.emit('connection_error', { code: 'token_expired' })
    current.simulateServerDisconnect()
    await vi.waitFor(() => {
      expect(current.connectCalls).toBe(1)
    })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('stays offline after a rejection that a new token cannot fix', async () => {
    setAccessToken('tok')
    const { socket, onStateChange } = setup()
    await socket.connect()
    const current = lastSocket()
    current.emit('connection_error', { code: 'password_change_required' })
    current.simulateServerDisconnect()
    await Promise.resolve()
    expect(current.connectCalls).toBe(0)
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(onStateChange).toHaveBeenLastCalledWith('offline')
    expect(socket.isAlive()).toBe(false)
  })

  it('stays offline after a token_invalid rejection', async () => {
    vi.useFakeTimers()
    setAccessToken('tok')
    const { socket, onStateChange } = setup()
    await socket.connect()
    const current = lastSocket()
    current.emit('connection_error', { code: 'token_invalid' })
    current.simulateServerDisconnect()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(current.connectCalls).toBe(0)
    expect(onStateChange).toHaveBeenLastCalledWith('offline')
  })

  it('reconnects with a growing delay after server_error and resets it once connected', async () => {
    vi.useFakeTimers()
    setAccessToken('tok')
    const { socket, onStateChange } = setup()
    await socket.connect()
    const current = lastSocket()
    const rejectWithServerError = (): void => {
      current.emit('connection_error', { code: 'server_error' })
      current.simulateServerDisconnect()
    }
    rejectWithServerError()
    expect(onStateChange).toHaveBeenLastCalledWith('connecting')
    await vi.advanceTimersByTimeAsync(4_999)
    expect(current.connectCalls).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(current.connectCalls).toBe(1)
    rejectWithServerError()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(current.connectCalls).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(current.connectCalls).toBe(2)
    current.simulateConnect()
    rejectWithServerError()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(current.connectCalls).toBe(3)
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('does not reconnect after server_error once disconnected', async () => {
    vi.useFakeTimers()
    setAccessToken('tok')
    const { socket } = setup()
    await socket.connect()
    const current = lastSocket()
    current.emit('connection_error', { code: 'server_error' })
    current.simulateServerDisconnect()
    socket.disconnect()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(current.connectCalls).toBe(0)
  })

  it('does not reconnect when the token refresh fails', async () => {
    setAccessToken('old')
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('offline'))
    const { socket } = setup()
    await socket.connect()
    const current = lastSocket()
    current.simulateConnect()
    current.emit('auth_expired')
    current.simulateServerDisconnect()
    await vi.waitFor(() => {
      expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    })
    await Promise.resolve()
    expect(current.connectCalls).toBe(0)
  })

  it('does not open a second connection while one is alive', async () => {
    setAccessToken('tok')
    const { socket } = setup()
    await socket.connect()
    lastSocket().simulateConnect()
    await socket.connect()
    expect(sockets).toHaveLength(1)
  })

  it('disconnects and forgets the socket', async () => {
    setAccessToken('tok')
    const { socket, onStateChange } = setup()
    await socket.connect()
    const current = lastSocket()
    current.simulateConnect()
    socket.disconnect()
    expect(current.disconnectCalls).toBe(1)
    expect(socket.isAlive()).toBe(false)
    expect(onStateChange).toHaveBeenLastCalledWith('offline')
    await socket.connect()
    expect(sockets).toHaveLength(2)
  })

  it('does not open a connection when disconnected while connecting', async () => {
    setAccessToken('tok')
    const { socket } = setup()
    const pending = socket.connect()
    socket.disconnect()
    await pending
    expect(sockets).toHaveLength(0)
    expect(socket.isAlive()).toBe(false)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken } from './access-token-store'
import type * as AuthApi from './auth-api'
import { changePasswordRequest, loginRequest, meRequest } from './auth-api'
import { resetAuthState } from './auth-state'
import { changePassword, login } from './auth-service'
import { endSession, onSessionEnded, onSessionStarted, startSession } from './session-channel'

vi.mock('./auth-api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  loginRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  meRequest: vi.fn(),
}))

const unsubscribers: (() => void)[] = []
afterEach(() => {
  while (unsubscribers.length > 0) unsubscribers.pop()?.()
  clearAccessToken()
  resetAuthState()
})

describe('session-channel', () => {
  it('notifies local listeners', () => {
    const listener = vi.fn()
    unsubscribers.push(onSessionEnded(listener))
    endSession()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    onSessionEnded(listener)()
    endSession()
    expect(listener).not.toHaveBeenCalled()
  })

  it('broadcasts the end of the session to other contexts', async () => {
    const other = new BroadcastChannel('mh-auth')
    const received = new Promise<unknown>((resolve) => {
      other.onmessage = (event: MessageEvent) => {
        resolve(event.data)
      }
    })
    endSession()
    expect(await received).toEqual({ type: 'session-ended' })
    other.close()
  })

  it('reports a session end coming from another context', async () => {
    const listener = vi.fn()
    unsubscribers.push(onSessionEnded(listener))
    const other = new BroadcastChannel('mh-auth')
    other.postMessage({ type: 'session-ended' })
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })
    other.close()
  })
})

describe('session-channel: session started', () => {
  it('notifies local listeners of a started session', () => {
    const listener = vi.fn()
    unsubscribers.push(onSessionStarted(listener))
    startSession()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying about a started session after unsubscribe', () => {
    const listener = vi.fn()
    onSessionStarted(listener)()
    startSession()
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not mix the started and ended signals', () => {
    const started = vi.fn()
    const ended = vi.fn()
    unsubscribers.push(onSessionStarted(started), onSessionEnded(ended))
    startSession()
    expect(ended).not.toHaveBeenCalled()
    endSession()
    expect(started).toHaveBeenCalledTimes(1)
  })

  it('broadcasts the start of the session to other contexts', async () => {
    const other = new BroadcastChannel('mh-auth')
    const received = new Promise<unknown>((resolve) => {
      other.onmessage = (event: MessageEvent) => {
        resolve(event.data)
      }
    })
    startSession()
    expect(await received).toEqual({ type: 'session-started' })
    other.close()
  })

  it('reports a session start coming from another context', async () => {
    const listener = vi.fn()
    unsubscribers.push(onSessionStarted(listener))
    const other = new BroadcastChannel('mh-auth')
    other.postMessage({ type: 'session-started' })
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })
    other.close()
  })
})

describe('auth-service starts the session', () => {
  const tokens = { accessToken: 'tok', expiresIn: 900, mustChangePassword: false }

  it('signals a started session after a login', async () => {
    vi.mocked(loginRequest).mockResolvedValue(tokens)
    vi.mocked(meRequest).mockResolvedValue({ id: 'u1', login: 'anna', mustChangePassword: false })
    const listener = vi.fn()
    unsubscribers.push(onSessionStarted(listener))
    await login('anna', 'secret')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('signals a started session after a password change', async () => {
    vi.mocked(changePasswordRequest).mockResolvedValue(tokens)
    vi.mocked(meRequest).mockResolvedValue({ id: 'u1', login: 'anna', mustChangePassword: false })
    const listener = vi.fn()
    unsubscribers.push(onSessionStarted(listener))
    await changePassword('old-secret', 'new-secret')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not signal a started session when the login fails', async () => {
    vi.mocked(loginRequest).mockRejectedValue(new Error('denied'))
    const listener = vi.fn()
    unsubscribers.push(onSessionStarted(listener))
    await expect(login('anna', 'wrong')).rejects.toThrow('denied')
    expect(listener).not.toHaveBeenCalled()
  })
})

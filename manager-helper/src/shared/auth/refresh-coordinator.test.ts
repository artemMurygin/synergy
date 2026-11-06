import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnauthorizedError } from './auth-api'
import { clearAccessToken, getAccessToken, setAccessToken } from './access-token-store'
import { refreshAccessToken } from './refresh-coordinator'
import { onSessionEnded } from './session-channel'

vi.mock('../settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function installLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const run = tail.then(callback)
    tail = run.catch(() => undefined)
    return run
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  return request
}

type Sender = (url: string, init: RequestInit) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn<Sender>>

beforeEach(() => {
  fetchMock = vi.fn<Sender>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  clearAccessToken()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('refresh-coordinator', () => {
  it('three parallel refreshes produce a single request', async () => {
    const locks = installLocks()
    fetchMock.mockResolvedValue(
      json({ accessToken: 'n1', expiresIn: 900, mustChangePassword: false }),
    )
    const results = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(locks).toHaveBeenCalledWith('auth-refresh', expect.any(Function))
    expect(results.every((r) => r.accessToken === 'n1')).toBe(true)
    expect(getAccessToken()).toBe('n1')
  })

  it('two contexts refresh strictly one after another', async () => {
    installLocks()
    let active = 0
    let maxActive = 0
    let counter = 0
    fetchMock.mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      counter += 1
      return json({ accessToken: `t${String(counter)}`, expiresIn: 900, mustChangePassword: false })
    })
    vi.resetModules()
    const a = await import('./refresh-coordinator')
    vi.resetModules()
    const b = await import('./refresh-coordinator')
    const [first, second] = await Promise.all([a.refreshAccessToken(), b.refreshAccessToken()])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
    expect(first.accessToken).not.toBe(second.accessToken)
  })

  it('works without Web Locks', async () => {
    fetchMock.mockResolvedValue(
      json({ accessToken: 'n2', expiresIn: 900, mustChangePassword: false }),
    )
    await refreshAccessToken()
    expect(getAccessToken()).toBe('n2')
  })

  it('a rejected refresh clears the token and publishes the session end', async () => {
    installLocks()
    setAccessToken('old')
    const listener = vi.fn()
    const off = onSessionEnded(listener)
    fetchMock.mockResolvedValue(json({ code: 'TOKEN_INVALID', message: 'x' }, 401))
    await expect(refreshAccessToken()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(getAccessToken()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })

  it('does not end the session when the server is unreachable', async () => {
    installLocks()
    setAccessToken('old')
    const listener = vi.fn()
    const off = onSessionEnded(listener)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(refreshAccessToken()).rejects.toThrow()
    expect(getAccessToken()).toBe('old')
    expect(listener).not.toHaveBeenCalled()
    off()
  })

  it('retries once on REFRESH_RACE', async () => {
    installLocks()
    fetchMock
      .mockResolvedValueOnce(json({ code: 'REFRESH_RACE', message: 'x' }, 409))
      .mockResolvedValueOnce(json({ accessToken: 'n3', expiresIn: 900, mustChangePassword: false }))
    await refreshAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessToken()).toBe('n3')
  })
})

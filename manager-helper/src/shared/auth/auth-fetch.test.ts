import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnauthorizedError } from './auth-api'
import { clearAccessToken, getAccessToken, setAccessToken } from './access-token-store'
import { authFetch } from './auth-fetch'
import { getAuthState, resetAuthState, setAuthState } from './auth-state'
import { onSessionEnded } from './session-channel'

vi.mock('../settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const expired = () => json({ code: 'TOKEN_EXPIRED', message: 'expired' }, 401)
const newTokens = (accessToken: string) =>
  json({ accessToken, expiresIn: 900, mustChangePassword: false })

function bearer(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('authorization')
}

type Sender = (url: string, init: RequestInit) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn<Sender>>
const API = 'http://api.test/threads'

beforeEach(() => {
  fetchMock = vi.fn<Sender>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  clearAccessToken()
  resetAuthState()
  vi.unstubAllGlobals()
})

function calls(url: string): [string, RequestInit][] {
  return fetchMock.mock.calls.filter(([u]) => u === url)
}

describe('authFetch', () => {
  it('adds the bearer header and keeps the caller headers', async () => {
    setAccessToken('tok')
    fetchMock.mockResolvedValue(json([]))
    await authFetch(API, { headers: { 'x-test': '1' } })
    const init = calls(API)[0]?.[1]
    expect(bearer(init)).toBe('Bearer tok')
    expect(new Headers(init?.headers).get('x-test')).toBe('1')
  })

  it('refreshes first when there is no token in memory', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/auth/refresh') ? newTokens('fresh') : json([])),
    )
    await authFetch(API)
    expect(calls('http://api.test/auth/refresh')).toHaveLength(1)
    expect(bearer(calls(API)[0]?.[1])).toBe('Bearer fresh')
  })

  it('on an expired token refreshes once and repeats the request', async () => {
    setAccessToken('old')
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return Promise.resolve(newTokens('fresh'))
      return Promise.resolve(bearer(init) === 'Bearer fresh' ? json({ ok: true }) : expired())
    })
    const response = await authFetch(API)
    expect(response.status).toBe(200)
    expect(calls('http://api.test/auth/refresh')).toHaveLength(1)
    expect(calls(API)).toHaveLength(2)
    expect(getAccessToken()).toBe('fresh')
  })

  it('three parallel expired requests share one refresh', async () => {
    setAccessToken('old')
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return Promise.resolve(newTokens('fresh'))
      return Promise.resolve(bearer(init) === 'Bearer fresh' ? json({ ok: true }) : expired())
    })
    const responses = await Promise.all([authFetch(API), authFetch(API), authFetch(API)])
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200])
    expect(calls('http://api.test/auth/refresh')).toHaveLength(1)
    expect(calls(API)).toHaveLength(6)
  })

  it('does not refresh again when another request already renewed the token', async () => {
    setAccessToken('old')
    let release: (() => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return Promise.resolve(newTokens('fresh'))
      if (bearer(init) === 'Bearer fresh') return Promise.resolve(json({ ok: true }))
      return new Promise<Response>((resolve) => {
        const respond = () => {
          resolve(expired())
        }
        if (release === undefined) release = respond
        else {
          respond()
          release()
        }
      })
    })
    const slow = authFetch(API)
    await vi.waitFor(() => {
      expect(calls(API)).toHaveLength(1)
    })
    const second = authFetch(API)
    await Promise.all([slow, second])
    expect(calls('http://api.test/auth/refresh')).toHaveLength(1)
  })

  it('repeats only once when the new token is also rejected', async () => {
    setAccessToken('old')
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/auth/refresh') ? newTokens('fresh') : expired()),
    )
    const response = await authFetch(API)
    expect(response.status).toBe(401)
    expect(calls(API)).toHaveLength(2)
    expect(calls('http://api.test/auth/refresh')).toHaveLength(1)
  })

  it('clears the token and publishes the session end when refresh answers 401', async () => {
    setAccessToken('old')
    const listener = vi.fn()
    const off = onSessionEnded(listener)
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/auth/refresh')
          ? json({ code: 'TOKEN_INVALID', message: 'x' }, 401)
          : expired(),
      ),
    )
    await expect(authFetch(API)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(getAccessToken()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })

  it('returns other errors untouched', async () => {
    setAccessToken('tok')
    fetchMock.mockResolvedValue(json({ code: 'X', message: 'boom' }, 500))
    const response = await authFetch(API)
    expect(response.status).toBe(500)
    expect(calls('http://api.test/auth/refresh')).toHaveLength(0)
  })

  it('switches to must-change-password on 403 PASSWORD_CHANGE_REQUIRED', async () => {
    setAccessToken('tok')
    setAuthState({ status: 'authenticated', user: { id: 'u', login: 'l' } })
    fetchMock.mockResolvedValue(json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'x' }, 403))
    const response = await authFetch(API)
    expect(response.status).toBe(403)
    expect(getAuthState().status).toBe('must-change-password')
  })

  it('switches to must-change-password on 403 received after a refresh retry', async () => {
    setAccessToken('old')
    setAuthState({ status: 'authenticated', user: { id: 'u', login: 'l' } })
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return Promise.resolve(newTokens('fresh'))
      return Promise.resolve(
        bearer(init) === 'Bearer fresh'
          ? json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'x' }, 403)
          : expired(),
      )
    })
    const response = await authFetch(API)
    expect(response.status).toBe(403)
    expect(getAuthState().status).toBe('must-change-password')
  })
})

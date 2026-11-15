import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/errors'
import {
  authorizedRequest,
  changePassword,
  fetchProfile,
  login,
  logout,
  restoreSession
} from './auth.api'
import { useSessionStore } from './model/session.store'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const tokens = (accessToken = 'access-1', mustChangePassword = false) => ({
  accessToken,
  expiresIn: 900,
  mustChangePassword
})
const profile = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: ['developer'], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null }

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>
function stubFetch(handler: Handler) {
  const fn = vi.fn((url: string, init: RequestInit) => {
    try {
      return Promise.resolve(handler(url, init))
    } catch (e) {
      return Promise.reject(e)
    }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
const path = (url: string) => new URL(url).pathname
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name)

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth api', () => {
  it('login posts credentials, keeps the token in memory and loads the profile', async () => {
    const fn = stubFetch((url) => (path(url) === '/auth/login' ? json(tokens()) : json(profile)))
    const result = await login('ivan', 'pw')
    const [loginUrl, loginInit] = fn.mock.calls[0]!
    expect(path(loginUrl)).toBe('/auth/login')
    expect(loginInit.method).toBe('POST')
    expect(JSON.parse(String(loginInit.body))).toEqual({ login: 'ivan', password: 'pw' })
    expect(loginInit.credentials).toBe('include')
    const [meUrl, meInit] = fn.mock.calls[1]!
    expect(path(meUrl)).toBe('/auth/me')
    expect(header(meInit, 'Authorization')).toBe('Bearer access-1')
    expect(result.roles).toEqual(['developer'])
    expect(useSessionStore.getState()).toMatchObject({ status: 'signedIn', accessToken: 'access-1' })
  })

  it('login maps 401 to INVALID_CREDENTIALS and leaves the session untouched', async () => {
    stubFetch(() => json({ code: 'INVALID_CREDENTIALS', message: 'bad' }, 401))
    await expect(login('ivan', 'x')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(useSessionStore.getState().status).toBe('restoring')
    expect(useSessionStore.getState().accessToken).toBeNull()
  })

  it('login maps a network failure to UNAVAILABLE', async () => {
    stubFetch(() => {
      throw new TypeError('network')
    })
    await expect(login('ivan', 'x')).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })

  it('login maps 429 to RATE_LIMITED', async () => {
    stubFetch(() => json({ code: 'RATE_LIMITED', message: 'slow' }, 429))
    await expect(login('ivan', 'x')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('restoreSession refreshes by cookie without a body and loads the profile', async () => {
    const fn = stubFetch((url) => (path(url) === '/auth/refresh' ? json(tokens('r1')) : json(profile)))
    await restoreSession()
    const [url, init] = fn.mock.calls[0]!
    expect(path(url)).toBe('/auth/refresh')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.body).toBeUndefined()
    expect(useSessionStore.getState()).toMatchObject({ status: 'signedIn', accessToken: 'r1' })
  })

  it('restoreSession on 401 signs out (login screen)', async () => {
    stubFetch(() => json({ code: 'TOKEN_INVALID', message: 'no' }, 401))
    await restoreSession()
    expect(useSessionStore.getState().status).toBe('signedOut')
  })

  it('restoreSession with the server down marks the session unavailable', async () => {
    stubFetch(() => {
      throw new TypeError('network')
    })
    await restoreSession()
    expect(useSessionStore.getState().status).toBe('unavailable')
  })

  it('two simultaneous restores share one refresh request', async () => {
    const fn = stubFetch((url) => (path(url) === '/auth/refresh' ? json(tokens()) : json(profile)))
    await Promise.all([restoreSession(), restoreSession()])
    expect(fn.mock.calls.filter(([u]) => path(u) === '/auth/refresh')).toHaveLength(1)
  })

  it('fetchProfile validates roles', async () => {
    stubFetch(() => json({ ...profile, roles: ['root'] }))
    await expect(fetchProfile()).rejects.toBeInstanceOf(ApiError)
  })

  it('logout revokes on the server and clears the token even when the server fails', async () => {
    useSessionStore.getState().signIn('tok', { ...profile, roles: ['developer'] })
    const fn = stubFetch(() => new Response(null, { status: 204 }))
    await logout()
    expect(path(fn.mock.calls[0]![0])).toBe('/auth/logout')
    expect(fn.mock.calls[0]![1].method).toBe('POST')
    expect(useSessionStore.getState()).toMatchObject({ status: 'signedOut', accessToken: null })

    useSessionStore.getState().signIn('tok', { ...profile, roles: [] })
    stubFetch(() => {
      throw new TypeError('network')
    })
    await logout()
    expect(useSessionStore.getState().status).toBe('signedOut')
  })

  it('changePassword sends both passwords with the token and stores the new token and profile', async () => {
    useSessionStore.getState().signIn('old', { ...profile, mustChangePassword: true, roles: [] })
    const fn = stubFetch((url) =>
      path(url) === '/auth/change-password' ? json(tokens('new')) : json({ ...profile, roles: [] })
    )
    await changePassword('temp', 'newpass')
    const [url, init] = fn.mock.calls[0]!
    expect(path(url)).toBe('/auth/change-password')
    expect(header(init, 'Authorization')).toBe('Bearer old')
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'temp', newPassword: 'newpass' })
    const s = useSessionStore.getState()
    expect(s.accessToken).toBe('new')
    expect(s.profile?.mustChangePassword).toBe(false)
  })

  it('authorizedRequest refreshes once on TOKEN_EXPIRED and repeats with the new token', async () => {
    useSessionStore.getState().signIn('stale', { ...profile, roles: [] })
    let calls = 0
    const fn = stubFetch((url) => {
      if (path(url) === '/auth/refresh') return json(tokens('fresh'))
      calls++
      return calls === 1 ? json({ code: 'TOKEN_EXPIRED', message: 'old' }, 401) : json({ ok: true })
    })
    await authorizedRequest('/portal/requests')
    const data = fn.mock.calls.filter(([u]) => path(u) !== '/auth/refresh')
    expect(header(data[0]![1], 'Authorization')).toBe('Bearer stale')
    expect(header(data[1]![1], 'Authorization')).toBe('Bearer fresh')
    expect(fn.mock.calls.filter(([u]) => path(u) === '/auth/refresh')).toHaveLength(1)
  })

  it('authorizedRequest signs out when the refresh is rejected', async () => {
    useSessionStore.getState().signIn('stale', { ...profile, roles: [] })
    stubFetch((url) =>
      path(url) === '/auth/refresh'
        ? json({ code: 'TOKEN_INVALID', message: 'no' }, 401)
        : json({ code: 'TOKEN_EXPIRED', message: 'old' }, 401)
    )
    await expect(authorizedRequest('/portal/requests')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(useSessionStore.getState()).toMatchObject({ status: 'signedOut', accessToken: null })
  })
})

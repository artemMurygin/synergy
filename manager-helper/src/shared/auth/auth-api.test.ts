import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Send,
  AuthNetworkError,
  InvalidCredentialsError,
  PasswordChangeRequiredError,
  RateLimitedError,
  SamePasswordError,
  UnauthorizedError,
  WeakPasswordError,
  WrongPasswordError,
  changePasswordRequest,
  loginRequest,
  logoutRequest,
  meRequest,
  refreshRequest,
} from './auth-api'

vi.mock('../settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const tokens = { accessToken: 'a1', expiresIn: 900, mustChangePassword: false }
type Sender = (url: string, init: RequestInit) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn<Sender>>

beforeEach(() => {
  fetchMock = vi.fn<Sender>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('fetch was not called')
  return { url: call[0], init: call[1] }
}

describe('auth-api', () => {
  it('login posts credentials with cookies included', async () => {
    fetchMock.mockResolvedValue(json(tokens))
    const result = await loginRequest('ivan', 'pw')
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/auth/login')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(typeof init.body === 'string' ? init.body : '')).toEqual({
      login: 'ivan',
      password: 'pw',
    })
    expect(result).toEqual(tokens)
  })

  it('refresh posts to /auth/refresh with cookies and no refresh token in the body', async () => {
    fetchMock.mockResolvedValue(json(tokens))
    await refreshRequest()
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/auth/refresh')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.body).toBeUndefined()
  })

  it('logout posts with cookies and accepts 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await logoutRequest()
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/auth/logout')
    expect(init.credentials).toBe('include')
  })

  it('changePassword goes through the given sender with cookies included', async () => {
    const send = vi.fn<Send>().mockResolvedValue(json(tokens))
    const result = await changePasswordRequest({ currentPassword: 'old', newPassword: 'new' }, send)
    const [url, init] = send.mock.calls[0] ?? ['', {}]
    expect(url).toBe('http://api.test/auth/change-password')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(typeof init.body === 'string' ? init.body : '')).toEqual({
      currentPassword: 'old',
      newPassword: 'new',
    })
    expect(result).toEqual(tokens)
  })

  it('me sends the bearer token', async () => {
    fetchMock.mockResolvedValue(json({ id: 'u1', login: 'ivan', mustChangePassword: false }))
    const user = await meRequest('tok')
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/auth/me')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
    expect(user).toEqual({ id: 'u1', login: 'ivan', mustChangePassword: false })
  })

  it('maps INVALID_CREDENTIALS', async () => {
    fetchMock.mockResolvedValue(json({ code: 'INVALID_CREDENTIALS', message: 'bad' }, 401))
    await expect(loginRequest('a', 'b')).rejects.toBeInstanceOf(InvalidCredentialsError)
  })

  it('maps RATE_LIMITED with retryAfterSeconds', async () => {
    fetchMock.mockResolvedValue(
      json({ code: 'RATE_LIMITED', message: 'slow', retryAfterSeconds: 42 }, 429),
    )
    const error = await loginRequest('a', 'b').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimitedError)
    expect(error).toMatchObject({ retryAfter: 42 })
  })

  it('falls back to the Retry-After header', async () => {
    fetchMock.mockResolvedValue(
      json({ code: 'RATE_LIMITED', message: 'slow' }, 429, { 'retry-after': '30' }),
    )
    const error = await loginRequest('a', 'b').catch((e: unknown) => e)
    expect(error).toMatchObject({ retryAfter: 30 })
  })

  it('maps PASSWORD_CHANGE_REQUIRED', async () => {
    fetchMock.mockResolvedValue(json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'x' }, 403))
    await expect(refreshRequest()).rejects.toBeInstanceOf(PasswordChangeRequiredError)
  })

  it('maps 401 token errors to UnauthorizedError', async () => {
    fetchMock.mockResolvedValue(json({ code: 'TOKEN_INVALID', message: 'x' }, 401))
    await expect(refreshRequest()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('maps password change errors', async () => {
    const send = vi.fn<Send>()
    send.mockResolvedValueOnce(json({ code: 'WRONG_PASSWORD', message: 'x' }, 422))
    await expect(
      changePasswordRequest({ currentPassword: 'a', newPassword: 'b' }, send),
    ).rejects.toBeInstanceOf(WrongPasswordError)
    send.mockResolvedValueOnce(json({ code: 'SAME_PASSWORD', message: 'x' }, 422))
    await expect(
      changePasswordRequest({ currentPassword: 'a', newPassword: 'a' }, send),
    ).rejects.toBeInstanceOf(SamePasswordError)
    send.mockResolvedValueOnce(
      json({ code: 'WEAK_PASSWORD', message: 'x', violations: ['too short'] }, 422),
    )
    const error = await changePasswordRequest(
      { currentPassword: 'a', newPassword: 'b' },
      send,
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WeakPasswordError)
    expect(error).toMatchObject({ violations: ['too short'] })
  })

  it('turns a network failure into AuthNetworkError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(refreshRequest()).rejects.toBeInstanceOf(AuthNetworkError)
  })
})

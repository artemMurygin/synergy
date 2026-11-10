import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessToken } from '../domain/access-token'
import { type AuthError, isAuthError } from '../domain/auth-error'
import { RefreshToken } from '../domain/refresh-token'
import { AuthApiClient } from './auth-api-client'

const BACKEND = 'http://backend.test'
const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600

function makeJwt(): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ sub: 'u1', exp: FAR_FUTURE_EXP })}.sig`
}

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const tokensBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  accessToken: makeJwt(),
  refreshToken: 'refresh-1',
  expiresIn: 900,
  mustChangePassword: false,
  ...overrides
})

describe('AuthApiClient', () => {
  const fetchMock = vi.fn()
  let client: AuthApiClient

  const lastRequest = (): { url: string; init: RequestInit; headers: Headers; body: unknown } => {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    const rawBody: unknown = init.body
    return {
      url,
      init,
      headers: new Headers(init.headers),
      body: typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined
    }
  }

  beforeEach(() => {
    fetchMock.mockReset()
    client = new AuthApiClient(BACKEND, fetchMock)
  })

  describe('requests', () => {
    it('logs in as a desktop client without Authorization or Cookie', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, tokensBody()))

      await client.login('anna', 'secret')

      const { url, init, headers, body } = lastRequest()
      expect(url).toBe(`${BACKEND}/auth/login`)
      expect(init.method).toBe('POST')
      expect(headers.get('x-client-type')).toBe('desktop')
      expect(headers.get('authorization')).toBeNull()
      expect(headers.get('cookie')).toBeNull()
      expect(body).toEqual({ login: 'anna', password: 'secret' })
    })

    it('returns parsed tokens and the mustChangePassword flag', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, tokensBody({ mustChangePassword: true })))

      const result = await client.login('anna', 'secret')

      expect(result.access).toBeInstanceOf(AccessToken)
      expect(result.refresh.value).toBe('refresh-1')
      expect(result.mustChangePassword).toBe(true)
    })

    it('sends the refresh token in the body and no Authorization header', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, tokensBody({ refreshToken: 'refresh-2' })))

      const result = await client.refresh(RefreshToken.of('refresh-1'))

      const { url, headers, body } = lastRequest()
      expect(url).toBe(`${BACKEND}/auth/refresh`)
      expect(headers.get('x-client-type')).toBe('desktop')
      expect(headers.get('authorization')).toBeNull()
      expect(body).toEqual({ refreshToken: 'refresh-1' })
      expect(result.refresh.value).toBe('refresh-2')
    })

    it('logs out with the refresh token in the body and no Authorization header', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      await client.logout(RefreshToken.of('refresh-1'))

      const { url, headers, body } = lastRequest()
      expect(url).toBe(`${BACKEND}/auth/logout`)
      expect(headers.get('x-client-type')).toBe('desktop')
      expect(headers.get('authorization')).toBeNull()
      expect(body).toEqual({ refreshToken: 'refresh-1' })
    })

    it('changes the password with a Bearer token', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, tokensBody()))
      const access = AccessToken.parse(makeJwt())

      await client.changePassword(access, 'old', 'new-password')

      const { url, headers, body } = lastRequest()
      expect(url).toBe(`${BACKEND}/auth/change-password`)
      expect(headers.get('authorization')).toBe(`Bearer ${access.value}`)
      expect(headers.get('x-client-type')).toBe('desktop')
      expect(body).toEqual({ currentPassword: 'old', newPassword: 'new-password' })
    })

    it('reads the current user with a Bearer token', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { id: 'u1', login: 'anna', mustChangePassword: false }))
      const access = AccessToken.parse(makeJwt())

      const user = await client.getCurrentUser(access)

      const { url, init, headers } = lastRequest()
      expect(url).toBe(`${BACKEND}/auth/me`)
      expect(init.method).toBe('GET')
      expect(headers.get('authorization')).toBe(`Bearer ${access.value}`)
      expect(user).toEqual({ id: 'u1', login: 'anna' })
    })
  })

  describe('error mapping', () => {
    const failsWith = async (call: () => Promise<unknown>, code: string): Promise<AuthError> => {
      const error = await call().then(
        () => null,
        (caught: unknown) => caught
      )
      if (!isAuthError(error)) throw new Error('expected an AuthError')
      expect(error.code).toBe(code)
      return error
    }

    it.each([
      ['TOKEN_EXPIRED', 401, 'TOKEN_EXPIRED'],
      ['TOKEN_INVALID', 401, 'TOKEN_INVALID'],
      ['INVALID_CREDENTIALS', 401, 'INVALID_CREDENTIALS'],
      ['PASSWORD_CHANGE_REQUIRED', 403, 'PASSWORD_CHANGE_REQUIRED'],
      ['REFRESH_RACE', 409, 'REFRESH_RACE'],
      ['WRONG_PASSWORD', 422, 'WRONG_PASSWORD'],
      ['SAME_PASSWORD', 422, 'SAME_PASSWORD'],
      ['WEAK_PASSWORD', 422, 'WEAK_PASSWORD']
    ])('maps the %s body code (HTTP %i) to %s', async (bodyCode, status, expected) => {
      fetchMock.mockResolvedValue(jsonResponse(status, { statusCode: status, message: 'x', code: bodyCode }))

      await failsWith(() => client.login('a', 'b'), expected)
    })

    it('falls back to INVALID_CREDENTIALS for a 401 without a code on login', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { statusCode: 401, message: 'Unauthorized' }))

      await failsWith(() => client.login('a', 'b'), 'INVALID_CREDENTIALS')
    })

    it('falls back to TOKEN_INVALID for a 401 without a code on refresh', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { statusCode: 401, message: 'Unauthorized' }))

      await failsWith(() => client.refresh(RefreshToken.of('r')), 'TOKEN_INVALID')
    })

    it('maps 429 to RATE_LIMITED with the Retry-After delay in seconds', async () => {
      fetchMock.mockResolvedValue(jsonResponse(429, { statusCode: 429, code: 'RATE_LIMITED' }, { 'retry-after': '42' }))

      const error = await failsWith(() => client.login('a', 'b'), 'RATE_LIMITED')

      expect(error.retryAfterSec).toBe(42)
    })

    it('maps 429 without a usable Retry-After to RATE_LIMITED without a delay', async () => {
      fetchMock.mockResolvedValue(jsonResponse(429, { statusCode: 429 }, { 'retry-after': 'soon' }))

      const error = await failsWith(() => client.login('a', 'b'), 'RATE_LIMITED')

      expect(error.retryAfterSec).toBeUndefined()
    })

    it('maps a network failure to NETWORK', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))

      await failsWith(() => client.login('a', 'b'), 'NETWORK')
    })

    it('maps 5xx to SERVER_ERROR', async () => {
      fetchMock.mockResolvedValue(new Response('oops', { status: 503 }))

      await failsWith(() => client.refresh(RefreshToken.of('r')), 'SERVER_ERROR')
    })

    it('maps a malformed success body to SERVER_ERROR', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { accessToken: makeJwt() }))

      await failsWith(() => client.login('a', 'b'), 'SERVER_ERROR')
    })

    it('never puts the response body or credentials into the error message', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { statusCode: 401, message: 'password hunter2 is wrong', code: 'INVALID_CREDENTIALS' })
      )

      const error = await failsWith(() => client.login('anna', 'hunter2'), 'INVALID_CREDENTIALS')

      expect(error.message).not.toContain('hunter2')
    })
  })
})

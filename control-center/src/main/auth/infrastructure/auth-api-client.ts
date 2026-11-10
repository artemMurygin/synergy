import { z } from 'zod'
import type { AuthApiPort, IssuedTokens } from '../application/auth-api.port'
import { AccessToken } from '../domain/access-token'
import { AuthError, type AuthErrorCode } from '../domain/auth-error'
import { RefreshToken } from '../domain/refresh-token'
import type { SessionUser } from '../domain/session-snapshot'

export type FetchPort = (url: string, init: RequestInit) => Promise<Response>

type Endpoint = 'login' | 'refresh' | 'logout' | 'change-password' | 'me'

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  mustChangePassword: z.boolean()
})

const currentUserSchema = z.object({ id: z.string(), login: z.string() })

const errorBodySchema = z.object({ code: z.string().optional() })

const CODE_BY_BODY_CODE: Partial<Record<string, AuthErrorCode>> = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  REFRESH_RACE: 'REFRESH_RACE',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  SAME_PASSWORD: 'SAME_PASSWORD',
  WEAK_PASSWORD: 'WEAK_PASSWORD'
}

const HTTP_UNAUTHORIZED = 401
const HTTP_TOO_MANY_REQUESTS = 429

export class AuthApiClient implements AuthApiPort {
  constructor(
    private readonly backendUrl: string,
    private readonly fetchFn: FetchPort
  ) {}

  async login(login: string, password: string): Promise<IssuedTokens> {
    const response = await this.send('login', { method: 'POST', body: { login, password } })
    return this.parseTokens(response)
  }

  async refresh(refreshToken: RefreshToken): Promise<IssuedTokens> {
    const response = await this.send('refresh', { method: 'POST', body: { refreshToken: refreshToken.value } })
    return this.parseTokens(response)
  }

  async logout(refreshToken: RefreshToken): Promise<void> {
    await this.send('logout', { method: 'POST', body: { refreshToken: refreshToken.value } })
  }

  async changePassword(access: AccessToken, currentPassword: string, newPassword: string): Promise<IssuedTokens> {
    const response = await this.send('change-password', {
      method: 'POST',
      access,
      body: { currentPassword, newPassword }
    })
    return this.parseTokens(response)
  }

  async getCurrentUser(access: AccessToken): Promise<SessionUser> {
    const response = await this.send('me', { method: 'GET', access })
    const parsed = currentUserSchema.safeParse(await this.readJson(response))
    if (!parsed.success) throw new AuthError('SERVER_ERROR')
    return { id: parsed.data.id, login: parsed.data.login }
  }

  private async send(
    endpoint: Endpoint,
    options: { method: 'GET' | 'POST'; body?: object; access?: AccessToken }
  ): Promise<Response> {
    const headers: Record<string, string> = { 'x-client-type': 'desktop', accept: 'application/json' }
    if (options.access) headers['authorization'] = `Bearer ${options.access.value}`
    if (options.body) headers['content-type'] = 'application/json'

    let response: Response
    try {
      response = await this.fetchFn(`${this.backendUrl}/auth/${endpoint}`, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      })
    } catch {
      throw new AuthError('NETWORK')
    }
    if (response.ok) return response
    throw await this.toAuthError(endpoint, response)
  }

  private async toAuthError(endpoint: Endpoint, response: Response): Promise<AuthError> {
    if (response.status === HTTP_TOO_MANY_REQUESTS) {
      const retryAfterSec = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
      return new AuthError('RATE_LIMITED', Number.isNaN(retryAfterSec) ? {} : { retryAfterSec })
    }
    const parsed = errorBodySchema.safeParse(await this.readJson(response))
    const bodyCode = parsed.success ? parsed.data.code : undefined
    const mapped = bodyCode === undefined ? undefined : CODE_BY_BODY_CODE[bodyCode]
    if (mapped) return new AuthError(mapped)
    if (response.status === HTTP_UNAUTHORIZED) {
      return new AuthError(endpoint === 'login' ? 'INVALID_CREDENTIALS' : 'TOKEN_INVALID')
    }
    return new AuthError('SERVER_ERROR')
  }

  private async parseTokens(response: Response): Promise<IssuedTokens> {
    const parsed = tokensSchema.safeParse(await this.readJson(response))
    if (!parsed.success) throw new AuthError('SERVER_ERROR')
    try {
      return {
        access: AccessToken.parse(parsed.data.accessToken),
        refresh: RefreshToken.of(parsed.data.refreshToken),
        mustChangePassword: parsed.data.mustChangePassword
      }
    } catch {
      throw new AuthError('SERVER_ERROR')
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      return undefined
    }
  }
}

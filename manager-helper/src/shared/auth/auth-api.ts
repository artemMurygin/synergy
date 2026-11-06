import { isRecord } from '../api'
import { getBackendUrl } from '../settings'

export interface TokenResponse {
  accessToken: string
  expiresIn: number
  mustChangePassword: boolean
}

export interface MeResponse {
  id: string
  login: string
  mustChangePassword: boolean
}

export type Send = (url: string, init: RequestInit) => Promise<Response>

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

/** The server cannot be reached. */
export class AuthNetworkError extends Error {}
export class InvalidCredentialsError extends AuthApiError {}
/** 401 with an expired or invalid token. */
export class UnauthorizedError extends AuthApiError {}
export class PasswordChangeRequiredError extends AuthApiError {}
export class RefreshRaceError extends AuthApiError {}
export class WrongPasswordError extends AuthApiError {}
export class SamePasswordError extends AuthApiError {}

export class RateLimitedError extends AuthApiError {
  constructor(
    message: string,
    readonly retryAfter: number,
  ) {
    super(message, 429, 'RATE_LIMITED')
  }
}

export class WeakPasswordError extends AuthApiError {
  constructor(
    message: string,
    readonly violations: string[],
  ) {
    super(message, 422, 'WEAK_PASSWORD')
  }
}

async function toError(response: Response): Promise<Error> {
  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = await response.json()
    if (isRecord(parsed)) body = parsed
  } catch {
    // not a JSON body: fall back to the status line
  }
  const code = typeof body.code === 'string' ? body.code : 'UNKNOWN'
  const message =
    typeof body.message === 'string'
      ? body.message
      : `Сервер ответил ошибкой ${String(response.status)}`
  const { status } = response
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return new InvalidCredentialsError(message, status, code)
    case 'PASSWORD_CHANGE_REQUIRED':
      return new PasswordChangeRequiredError(message, status, code)
    case 'REFRESH_RACE':
      return new RefreshRaceError(message, status, code)
    case 'WRONG_PASSWORD':
      return new WrongPasswordError(message, status, code)
    case 'SAME_PASSWORD':
      return new SamePasswordError(message, status, code)
    case 'WEAK_PASSWORD': {
      const violations = Array.isArray(body.violations)
        ? body.violations.filter((v): v is string => typeof v === 'string')
        : []
      return new WeakPasswordError(message, violations)
    }
    case 'RATE_LIMITED': {
      const header = Number(response.headers.get('retry-after'))
      const retryAfter =
        typeof body.retryAfterSeconds === 'number'
          ? body.retryAfterSeconds
          : Number.isFinite(header)
            ? header
            : 0
      return new RateLimitedError(message, retryAfter)
    }
    default:
      return status === 401
        ? new UnauthorizedError(message, status, code)
        : new AuthApiError(message, status, code)
  }
}

async function call(path: string, init: RequestInit, send: Send = fetch): Promise<Response> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await send(`${baseUrl}${path}`, { ...init, credentials: 'include' })
  } catch {
    throw new AuthNetworkError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (!response.ok) throw await toError(response)
  return response
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function parseTokens(response: Response): Promise<TokenResponse> {
  const body: unknown = await response.json()
  if (
    !isRecord(body) ||
    typeof body.accessToken !== 'string' ||
    typeof body.expiresIn !== 'number'
  ) {
    throw new AuthApiError(
      'Сервер вернул ответ в неожиданном формате',
      response.status,
      'UNEXPECTED',
    )
  }
  return {
    accessToken: body.accessToken,
    expiresIn: body.expiresIn,
    mustChangePassword: body.mustChangePassword === true,
  }
}

export async function loginRequest(login: string, password: string): Promise<TokenResponse> {
  return parseTokens(await call('/auth/login', jsonInit({ login, password })))
}

/**
 * The only place that knows how the refresh token travels. Default: the HttpOnly
 * cookie. A body-based fallback would change only this function.
 */
export async function refreshRequest(): Promise<TokenResponse> {
  return parseTokens(await call('/auth/refresh', { method: 'POST' }))
}

export async function logoutRequest(send?: Send): Promise<void> {
  await call('/auth/logout', { method: 'POST' }, send)
}

export async function changePasswordRequest(
  input: { currentPassword: string; newPassword: string },
  send?: Send,
): Promise<TokenResponse> {
  return parseTokens(await call('/auth/change-password', jsonInit(input), send))
}

export async function meRequest(accessToken: string): Promise<MeResponse> {
  const response = await call('/auth/me', { headers: { authorization: `Bearer ${accessToken}` } })
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.login !== 'string') {
    throw new AuthApiError(
      'Сервер вернул ответ в неожиданном формате',
      response.status,
      'UNEXPECTED',
    )
  }
  return { id: body.id, login: body.login, mustChangePassword: body.mustChangePassword === true }
}

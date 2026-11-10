export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'REFRESH_RACE'
  | 'WRONG_PASSWORD'
  | 'SAME_PASSWORD'
  | 'WEAK_PASSWORD'
  | 'NETWORK'
  | 'SERVER_ERROR'

interface AuthErrorOptions {
  retryAfterSec?: number
}

export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly retryAfterSec?: number

  constructor(code: AuthErrorCode, options: AuthErrorOptions = {}) {
    super(code)
    this.name = 'AuthError'
    this.code = code
    this.retryAfterSec = options.retryAfterSec
  }
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError
}

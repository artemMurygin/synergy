import { describe, expect, it } from 'vitest'
import { AuthError, isAuthError } from './auth-error'

describe('AuthError', () => {
  it('carries a code and optional retry delay', () => {
    const error = new AuthError('RATE_LIMITED', { retryAfterSec: 42 })

    expect(error.code).toBe('RATE_LIMITED')
    expect(error.retryAfterSec).toBe(42)
    expect(error).toBeInstanceOf(Error)
  })

  it('has no retry delay by default', () => {
    expect(new AuthError('NETWORK').retryAfterSec).toBeUndefined()
  })

  it('is recognised by the type guard only for AuthError instances', () => {
    expect(isAuthError(new AuthError('TOKEN_INVALID'))).toBe(true)
    expect(isAuthError(new Error('boom'))).toBe(false)
    expect(isAuthError('TOKEN_INVALID')).toBe(false)
  })

  it('does not leak response bodies through the message', () => {
    expect(new AuthError('INVALID_CREDENTIALS').message).toBe('INVALID_CREDENTIALS')
  })
})

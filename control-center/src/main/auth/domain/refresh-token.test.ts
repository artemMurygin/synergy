import { describe, expect, it } from 'vitest'
import { RefreshToken } from './refresh-token'

describe('RefreshToken', () => {
  it('exposes the value only through the explicit accessor', () => {
    const token = RefreshToken.of('secret-refresh')

    expect(token.value).toBe('secret-refresh')
  })

  it('hides the value from string conversion, JSON and logs', () => {
    const token = RefreshToken.of('secret-refresh')

    expect(String(token)).toBe('[redacted]')
    expect(`${token}`).toBe('[redacted]')
    expect(JSON.stringify({ token })).not.toContain('secret-refresh')
    expect(JSON.stringify({ token })).toContain('[redacted]')
  })

  it('rejects an empty value', () => {
    expect(() => RefreshToken.of('')).toThrow()
  })
})

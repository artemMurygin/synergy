import { describe, expect, it } from 'vitest'
import { AccessToken } from './access-token'

const NOW_MS = 1_700_000_000_000

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('AccessToken', () => {
  it('reads expiration from the JWT payload', () => {
    const token = AccessToken.parse(makeJwt({ exp: 1_700_000_100 }))

    expect(token.expiresAtMs).toBe(1_700_000_100_000)
    expect(token.value).toContain('.')
  })

  it('reports that it expires within the given window', () => {
    const token = AccessToken.parse(makeJwt({ exp: NOW_MS / 1000 + 20 }))

    expect(token.expiresWithin(30_000, NOW_MS)).toBe(true)
    expect(token.expiresWithin(10_000, NOW_MS)).toBe(false)
  })

  it('treats an already expired token as expiring within any window', () => {
    const token = AccessToken.parse(makeJwt({ exp: NOW_MS / 1000 - 5 }))

    expect(token.expiresWithin(0, NOW_MS)).toBe(true)
  })

  it.each([
    ['not three parts', 'abc'],
    ['payload is not base64 json', 'a.%%%.c'],
    ['payload without exp', makeJwt({ sub: 'user' })],
    ['exp is not a number', makeJwt({ exp: 'soon' })]
  ])('rejects a malformed token: %s', (_label, raw) => {
    expect(() => AccessToken.parse(raw)).toThrow()
  })
})

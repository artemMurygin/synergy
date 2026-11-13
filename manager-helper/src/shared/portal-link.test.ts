import { describe, expect, it } from 'vitest'
import { buildRequestUrl } from './portal-link'

describe('buildRequestUrl', () => {
  it('builds the request page address of the configured portal', () => {
    expect(buildRequestUrl('https://portal.example.com', 'r1')).toBe(
      'https://portal.example.com/requests/r1',
    )
  })

  it('encodes the request id', () => {
    expect(buildRequestUrl('https://portal.example.com', 'a b/1?x#y')).toBe(
      'https://portal.example.com/requests/a%20b%2F1%3Fx%23y',
    )
  })

  it('keeps a path prefix of the portal and ignores a trailing slash', () => {
    expect(buildRequestUrl('https://example.com/featurer/', 'r1')).toBe(
      'https://example.com/featurer/requests/r1',
    )
  })

  it.each([null, '', '   ', 'not a url', 'javascript:alert(1)', 'ftp://portal.example.com'])(
    'returns null for the unusable portal address %j',
    (portalUrl) => {
      expect(buildRequestUrl(portalUrl, 'r1')).toBeNull()
    },
  )

  it.each(['', '.', '..'])('returns null for the id %j that cannot form a portal address', (id) => {
    expect(buildRequestUrl('https://portal.example.com', id)).toBeNull()
  })
})

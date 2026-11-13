import { describe, expect, it } from 'vitest'
import { buildPortalRequestUrl } from './portal-link'

describe('buildPortalRequestUrl', () => {
  it('builds <portal>/requests/<encoded id>', () => {
    expect(buildPortalRequestUrl('https://portal.example.com', 'abc-123')).toBe('https://portal.example.com/requests/abc-123')
  })

  it('keeps a portal base path', () => {
    expect(buildPortalRequestUrl('https://example.com/portal', 'r1')).toBe('https://example.com/portal/requests/r1')
  })

  it('encodes the identifier', () => {
    expect(buildPortalRequestUrl('https://portal.example.com', 'a/b?c#d e')).toBe(
      `https://portal.example.com/requests/${encodeURIComponent('a/b?c#d e')}`
    )
  })

  it('rejects identifiers that escape the requests path', () => {
    expect(buildPortalRequestUrl('https://portal.example.com', '..')).toBeNull()
    expect(buildPortalRequestUrl('https://portal.example.com', '.')).toBeNull()
  })

  it('rejects an empty identifier', () => {
    expect(buildPortalRequestUrl('https://portal.example.com', '')).toBeNull()
  })

  it('rejects an identifier that would change the origin', () => {
    expect(buildPortalRequestUrl('https://portal.example.com', '@evil.com')).toMatch(/^https:\/\/portal\.example\.com\/requests\//)
    expect(buildPortalRequestUrl('https://portal.example.com', 'https://evil.com')).toMatch(/^https:\/\/portal\.example\.com\/requests\//)
  })

  it('returns null for an unusable portal address', () => {
    expect(buildPortalRequestUrl('not a url', 'r1')).toBeNull()
    expect(buildPortalRequestUrl('ftp://portal.example.com', 'r1')).toBeNull()
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { getBackendUrl, getPortalUrl } from './backend-config'

describe('getBackendUrl', () => {
  const original = process.env['CC_BACKEND_URL']

  afterEach(() => {
    if (original === undefined) delete process.env['CC_BACKEND_URL']
    else process.env['CC_BACKEND_URL'] = original
  })

  it('returns the default when CC_BACKEND_URL is not set', () => {
    delete process.env['CC_BACKEND_URL']
    expect(getBackendUrl()).toBe('http://localhost:3000')
  })

  it('reads CC_BACKEND_URL', () => {
    process.env['CC_BACKEND_URL'] = 'https://api.example.com:8443'
    expect(getBackendUrl()).toBe('https://api.example.com:8443')
  })

  it('strips trailing slashes', () => {
    process.env['CC_BACKEND_URL'] = 'http://localhost:4000//'
    expect(getBackendUrl()).toBe('http://localhost:4000')
  })

  it('throws on an invalid URL', () => {
    process.env['CC_BACKEND_URL'] = 'not a url'
    expect(() => getBackendUrl()).toThrow(/CC_BACKEND_URL/)
  })

  it('throws on a scheme other than http/https', () => {
    process.env['CC_BACKEND_URL'] = 'ftp://localhost:3000'
    expect(() => getBackendUrl()).toThrow(/CC_BACKEND_URL/)
  })
})

describe('getPortalUrl', () => {
  const original = process.env['CC_PORTAL_URL']

  afterEach(() => {
    if (original === undefined) delete process.env['CC_PORTAL_URL']
    else process.env['CC_PORTAL_URL'] = original
  })

  it('is null when CC_PORTAL_URL is not set or blank', () => {
    delete process.env['CC_PORTAL_URL']
    expect(getPortalUrl()).toBeNull()
    process.env['CC_PORTAL_URL'] = '   '
    expect(getPortalUrl()).toBeNull()
  })

  it('reads CC_PORTAL_URL without trailing slashes', () => {
    process.env['CC_PORTAL_URL'] = 'https://portal.example.com//'
    expect(getPortalUrl()).toBe('https://portal.example.com')
  })

  it('is null for an invalid or non-http(s) address', () => {
    process.env['CC_PORTAL_URL'] = 'not a url'
    expect(getPortalUrl()).toBeNull()
    process.env['CC_PORTAL_URL'] = 'javascript:alert(1)'
    expect(getPortalUrl()).toBeNull()
    process.env['CC_PORTAL_URL'] = 'file:///etc/passwd'
    expect(getPortalUrl()).toBeNull()
  })
})

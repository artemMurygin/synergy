import { afterEach, describe, expect, it } from 'vitest'
import { getBackendUrl } from './backend-config'

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

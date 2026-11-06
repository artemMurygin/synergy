import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, getAccessToken, setAccessToken } from './access-token-store'

afterEach(() => {
  clearAccessToken()
  vi.unstubAllGlobals()
})

describe('access-token-store', () => {
  it('keeps the token in memory', () => {
    expect(getAccessToken()).toBeNull()
    setAccessToken('abc')
    expect(getAccessToken()).toBe('abc')
    clearAccessToken()
    expect(getAccessToken()).toBeNull()
  })

  it('never writes the token to extension or web storage', () => {
    const set = vi.fn()
    vi.stubGlobal('chrome', {
      storage: { local: { set }, sync: { set }, session: { set } },
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setAccessToken('secret-token')
    expect(set).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })
})

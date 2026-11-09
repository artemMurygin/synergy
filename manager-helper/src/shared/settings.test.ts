import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken, getAccessToken, clearAccessToken } from './auth/access-token-store'
import { getAuthState, resetAuthState, setAuthState } from './auth/auth-state'
import { getBackendUrl, setBackendUrl } from './settings'

let store: Record<string, unknown>
let request: ReturnType<typeof vi.fn<(p: { origins: string[] }) => Promise<boolean>>>

beforeEach(() => {
  store = {}
  request = vi.fn<(p: { origins: string[] }) => Promise<boolean>>().mockResolvedValue(true)
  vi.stubGlobal('chrome', {
    storage: {
      sync: {
        get: (key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {}),
        set: (items: Record<string, unknown>) => {
          Object.assign(store, items)
          return Promise.resolve()
        },
      },
    },
    permissions: { request },
  })
  setAccessToken('tok')
  setAuthState({ status: 'authenticated' })
})
afterEach(() => {
  clearAccessToken()
  resetAuthState()
  vi.unstubAllGlobals()
})

describe('setBackendUrl', () => {
  it('requests host permission for a new remote origin and resets the session', async () => {
    await expect(setBackendUrl('https://api.example.com/')).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ origins: ['https://api.example.com/*'] })
    expect(await getBackendUrl()).toBe('https://api.example.com')
    expect(getAccessToken()).toBeNull()
    expect(getAuthState().status).toBe('anonymous')
  })

  it('does not save or reset the session when permission is denied', async () => {
    request.mockResolvedValue(false)
    await expect(setBackendUrl('https://api.example.com')).resolves.toBe(false)
    expect(await getBackendUrl()).toBe('http://77.105.146.171:1234')
    expect(getAccessToken()).toBe('tok')
    expect(getAuthState().status).toBe('authenticated')
  })

  it('does not request permissions for localhost but still resets on change', async () => {
    await setBackendUrl('http://localhost:4000')
    expect(request).not.toHaveBeenCalled()
    expect(getAuthState().status).toBe('anonymous')
  })

  it('keeps the session when the address is unchanged', async () => {
    await setBackendUrl('http://77.105.146.171:1234/')
    expect(getAccessToken()).toBe('tok')
    expect(getAuthState().status).toBe('authenticated')
  })

  it.each(['http://backend.corp.example:3000', 'http://192.168.0.5:3000'])(
    'allows cleartext http for the remote host %s',
    async (url) => {
      await expect(setBackendUrl(url)).resolves.toBe(true)
      expect(request).toHaveBeenCalledWith({ origins: [`${new URL(url).origin}/*`] })
      expect(await getBackendUrl()).toBe(url)
    },
  )

  it.each(['not a url', 'backend.example.com:3000', ''])(
    'refuses an invalid address "%s" without saving it',
    async (url) => {
      await expect(setBackendUrl(url)).resolves.toBe(false)
      expect(request).not.toHaveBeenCalled()
      expect(await getBackendUrl()).toBe('http://77.105.146.171:1234')
      expect(getAuthState().status).toBe('authenticated')
    },
  )

  it('allows http for 127.0.0.1', async () => {
    await expect(setBackendUrl('http://127.0.0.1:3000')).resolves.toBe(true)
    expect(request).not.toHaveBeenCalled()
  })
})

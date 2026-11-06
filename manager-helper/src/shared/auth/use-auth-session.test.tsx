import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, getAccessToken } from './access-token-store'
import { InvalidCredentialsError } from './auth-api'
import { resetAuthState } from './auth-state'
import { endSession } from './session-channel'
import { useAuthSession } from './use-auth-session'

vi.mock('../settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const tokens = (mustChangePassword = false) => ({
  accessToken: 'tok',
  expiresIn: 900,
  mustChangePassword,
})
const me = (mustChangePassword = false) => ({ id: 'u1', login: 'ivan', mustChangePassword })

type Route = (init: RequestInit) => Response | Promise<Response>
let routes: Record<string, Route>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  routes = {}
  fetchMock = vi.fn((url: string, init: RequestInit) => {
    const route = routes[new URL(url).pathname]
    if (route === undefined) return Promise.reject(new Error(`no route ${url}`))
    return Promise.resolve(route(init))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  clearAccessToken()
  resetAuthState()
  vi.unstubAllGlobals()
})

describe('useAuthSession', () => {
  it('starts in restoring and ends authenticated when the cookie session is valid', async () => {
    routes['/auth/refresh'] = () => json(tokens())
    routes['/auth/me'] = () => json(me())
    const { result } = renderHook(() => useAuthSession())
    expect(result.current.status).toBe('restoring')
    await waitFor(() => {
      expect(result.current.status).toBe('authenticated')
    })
    expect(result.current.user).toEqual({ id: 'u1', login: 'ivan' })
  })

  it('goes to must-change-password when restore says so', async () => {
    routes['/auth/refresh'] = () => json(tokens(true))
    routes['/auth/me'] = () => json(me(true))
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => {
      expect(result.current.status).toBe('must-change-password')
    })
  })

  it('goes to anonymous when the server answers 401', async () => {
    routes['/auth/refresh'] = () => json({ code: 'TOKEN_INVALID', message: 'x' }, 401)
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => {
      expect(result.current.status).toBe('anonymous')
    })
  })

  it('stays offline, never anonymous, when the server is unreachable, and retries', async () => {
    const seen: string[] = []
    routes['/auth/refresh'] = () => {
      throw new TypeError('Failed to fetch')
    }
    const { result } = renderHook(() => {
      const session = useAuthSession()
      seen.push(session.status)
      return session
    })
    await waitFor(() => {
      expect(result.current.status).toBe('offline')
    })
    expect(seen).not.toContain('anonymous')

    routes['/auth/refresh'] = () => json(tokens())
    routes['/auth/me'] = () => json(me())
    await act(async () => {
      await result.current.retry()
    })
    expect(result.current.status).toBe('authenticated')
  })

  describe('actions', () => {
    async function anonymousHook() {
      routes['/auth/refresh'] = () => json({ code: 'TOKEN_INVALID', message: 'x' }, 401)
      const hook = renderHook(() => useAuthSession())
      await waitFor(() => {
        expect(hook.result.current.status).toBe('anonymous')
      })
      return hook
    }

    it('login authenticates and stores the token in memory', async () => {
      const { result } = await anonymousHook()
      routes['/auth/login'] = () => json(tokens())
      routes['/auth/me'] = () => json(me())
      await act(async () => {
        await result.current.login('ivan', 'pw')
      })
      expect(result.current.status).toBe('authenticated')
      expect(getAccessToken()).toBe('tok')
    })

    it('login with a temporary password requires a password change', async () => {
      const { result } = await anonymousHook()
      routes['/auth/login'] = () => json(tokens(true))
      routes['/auth/me'] = () => json(me(true))
      await act(async () => {
        await result.current.login('ivan', 'tmp')
      })
      expect(result.current.status).toBe('must-change-password')
    })

    it('a failed login throws and stays anonymous', async () => {
      const { result } = await anonymousHook()
      routes['/auth/login'] = () => json({ code: 'INVALID_CREDENTIALS', message: 'x' }, 401)
      await act(async () => {
        await expect(result.current.login('ivan', 'bad')).rejects.toBeInstanceOf(
          InvalidCredentialsError,
        )
      })
      expect(result.current.status).toBe('anonymous')
    })

    it('changePassword authenticates with the new token pair', async () => {
      routes['/auth/refresh'] = () => json(tokens(true))
      routes['/auth/me'] = () => json(me(true))
      const { result } = renderHook(() => useAuthSession())
      await waitFor(() => {
        expect(result.current.status).toBe('must-change-password')
      })
      routes['/auth/change-password'] = () =>
        json({ accessToken: 'tok2', expiresIn: 900, mustChangePassword: false })
      routes['/auth/me'] = () => json(me())
      await act(async () => {
        await result.current.changePassword('old', 'newpass123')
      })
      expect(result.current.status).toBe('authenticated')
      expect(getAccessToken()).toBe('tok2')
    })

    it('logout revokes the session and clears the token', async () => {
      routes['/auth/refresh'] = () => json(tokens())
      routes['/auth/me'] = () => json(me())
      const { result } = renderHook(() => useAuthSession())
      await waitFor(() => {
        expect(result.current.status).toBe('authenticated')
      })
      routes['/auth/logout'] = () => new Response(null, { status: 204 })
      await act(async () => {
        await result.current.logout()
      })
      expect(result.current.status).toBe('anonymous')
      expect(result.current.notice).toBeNull()
      expect(getAccessToken()).toBeNull()
    })

    it('logout without a server still clears the token and warns', async () => {
      routes['/auth/refresh'] = () => json(tokens())
      routes['/auth/me'] = () => json(me())
      const { result } = renderHook(() => useAuthSession())
      await waitFor(() => {
        expect(result.current.status).toBe('authenticated')
      })
      routes['/auth/logout'] = () => {
        throw new TypeError('Failed to fetch')
      }
      await act(async () => {
        await result.current.logout()
      })
      expect(result.current.status).toBe('anonymous')
      expect(result.current.notice).toBe('logout-offline')
      expect(getAccessToken()).toBeNull()
    })

    it('a session end from another context moves this one to anonymous', async () => {
      routes['/auth/refresh'] = () => json(tokens())
      routes['/auth/me'] = () => json(me())
      const { result } = renderHook(() => useAuthSession())
      await waitFor(() => {
        expect(result.current.status).toBe('authenticated')
      })
      const other = new BroadcastChannel('mh-auth')
      act(() => {
        other.postMessage({ type: 'session-ended' })
      })
      await waitFor(() => {
        expect(result.current.status).toBe('anonymous')
      })
      expect(getAccessToken()).toBeNull()
      other.close()
    })

    it('a local session end moves the hook to anonymous', async () => {
      routes['/auth/refresh'] = () => json(tokens())
      routes['/auth/me'] = () => json(me())
      const { result } = renderHook(() => useAuthSession())
      await waitFor(() => {
        expect(result.current.status).toBe('authenticated')
      })
      act(() => {
        endSession()
      })
      expect(result.current.status).toBe('anonymous')
    })
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from './SessionProvider'
import { useSession } from './use-session'
import { useSessionStore } from './model/session.store'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const tokens = { accessToken: 't', expiresIn: 900, mustChangePassword: false }
const dev = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: ['developer'] }

function stub(handler: (path: string) => Response) {
  const fn = vi.fn((url: string) => {
    try {
      return Promise.resolve(handler(new URL(url).pathname))
    } catch (e) {
      return Promise.reject(e)
    }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function Probe() {
  const { status, profile, roles } = useSession()
  return (
    <p>
      {status}|{profile?.login ?? '-'}|{roles.join(',')}
    </p>
  )
}

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useSession', () => {
  it('reports restoring with no roles before anything happens', () => {
    const { result } = renderHook(() => useSession())
    expect(result.current).toMatchObject({ status: 'restoring', profile: null, roles: [] })
  })

  it('takes roles from the profile', () => {
    useSessionStore.getState().signIn('t', dev as never)
    const { result } = renderHook(() => useSession())
    expect(result.current.status).toBe('signedIn')
    expect(result.current.roles).toEqual(['developer'])
  })
})

describe('SessionProvider', () => {
  it('restores the session by cookie on open', async () => {
    stub((p) => (p === '/auth/refresh' ? json(tokens) : json(dev)))
    render(
      <Providers>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </Providers>
    )
    await screen.findByText('signedIn|ivan|developer')
  })

  it('shows signedOut when the cookie is rejected', async () => {
    stub(() => json({ code: 'TOKEN_INVALID', message: 'x' }, 401))
    render(
      <Providers>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </Providers>
    )
    await screen.findByText('signedOut|-|')
  })

  it('shows unavailable when the server does not answer', async () => {
    stub(() => {
      throw new TypeError('network')
    })
    render(
      <Providers>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </Providers>
    )
    await screen.findByText('unavailable|-|')
  })

  it('logout through useSession revokes the session and signs out', async () => {
    const fn = stub((p) => (p === '/auth/refresh' ? json(tokens) : p === '/auth/me' ? json(dev) : new Response(null, { status: 204 })))
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => (
        <Providers>
          <SessionProvider>{children}</SessionProvider>
        </Providers>
      )
    })
    await waitFor(() => expect(result.current.status).toBe('signedIn'))
    await act(async () => {
      await result.current.logout()
    })
    expect(result.current.status).toBe('signedOut')
    expect(fn.mock.calls.some(([u]) => new URL(u).pathname === '/auth/logout')).toBe(true)
  })
})

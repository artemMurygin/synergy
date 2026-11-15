import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogin } from './use-login'
import { useSessionStore } from './model/session.store'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLogin', () => {
  it('signs in and exposes the profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new URL(url).pathname === '/auth/login'
            ? json({ accessToken: 't', expiresIn: 900, mustChangePassword: false })
            : json({ id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
        )
      )
    )
    const { result } = renderHook(() => useLogin(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ login: 'ivan', password: 'pw' })
    })
    expect(useSessionStore.getState().status).toBe('signedIn')
  })

  it('wrong credentials give INVALID_CREDENTIALS', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ code: 'INVALID_CREDENTIALS', message: 'x' }, 401))))
    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => result.current.mutate({ login: 'ivan', password: 'bad' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('unavailable server gives a different error than wrong credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))))
    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => result.current.mutate({ login: 'ivan', password: 'pw' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ code: 'UNAVAILABLE' })
    expect(result.current.error?.code).not.toBe('INVALID_CREDENTIALS')
    expect(useSessionStore.getState().status).toBe('restoring')
  })
})

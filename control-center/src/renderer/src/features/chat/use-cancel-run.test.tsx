import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendError } from '@/lib/backend/errors'
import * as api from '@/lib/backend/threads.api'
import { useCancelRun } from './use-cancel-run'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useCancelRun', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls cancelRun with the thread id', async () => {
    const spy = vi.spyOn(api, 'cancelRun').mockResolvedValue(undefined)
    const { result } = renderHook(() => useCancelRun('t1'), { wrapper: wrapper() })
    await act(async () => {
      await result.current.mutateAsync()
    })
    expect(spy).toHaveBeenCalledWith('t1')
  })

  it('204/404 (resolved cancelRun) is not an error', async () => {
    vi.spyOn(api, 'cancelRun').mockResolvedValue(undefined)
    const { result } = renderHook(() => useCancelRun('t1'), { wrapper: wrapper() })
    act(() => result.current.mutate())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
  })

  it('surfaces real failures', async () => {
    vi.spyOn(api, 'cancelRun').mockRejectedValue(new BackendError('boom'))
    const { result } = renderHook(() => useCancelRun('t1'), { wrapper: wrapper() })
    act(() => result.current.mutate())
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

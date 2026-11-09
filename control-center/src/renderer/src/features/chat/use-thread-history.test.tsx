import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadNotFoundError } from '@/lib/backend/errors'
import * as api from '@/lib/backend/threads.api'
import { useChatStore } from '@/stores/chat.store'
import { useThreadHistory } from './use-thread-history'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const history = (text: string, running = false) => ({
  messages: [{ id: 'm1', role: 'user' as const, content: text }],
  running
})

describe('useThreadHistory', () => {
  beforeEach(() => {
    useChatStore.setState({ activeThreadId: 't1' })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns messages and running, isInitialLoad only on first load', async () => {
    vi.spyOn(api, 'getThreadHistory').mockResolvedValue(history('hi', true) as never)
    const { result } = renderHook(() => useThreadHistory('t1'), { wrapper: wrapper() })
    expect(result.current.isInitialLoad).toBe(true)
    expect(result.current.messages).toEqual([])
    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.running).toBe(true)
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.isInitialLoad).toBe(false)
  })

  it('404 yields ThreadNotFoundError and resets the active chat to null', async () => {
    vi.spyOn(api, 'getThreadHistory').mockRejectedValue(new ThreadNotFoundError('gone'))
    const { result } = renderHook(() => useThreadHistory('t1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ThreadNotFoundError))
    expect(useChatStore.getState().activeThreadId).toBeNull()
  })

  it('ignores a stale response after the threadId changes', async () => {
    let resolveA: (v: never) => void = () => {}
    vi.spyOn(api, 'getThreadHistory').mockImplementation((id: string) =>
      id === 'a'
        ? new Promise((r) => {
            resolveA = r
          })
        : (Promise.resolve(history('from-b')) as never)
    )
    const { result, rerender } = renderHook(({ id }) => useThreadHistory(id), {
      wrapper: wrapper(),
      initialProps: { id: 'a' }
    })
    rerender({ id: 'b' })
    await waitFor(() => expect(result.current.messages[0]?.content).toBe('from-b'))
    await act(async () => {
      resolveA(history('from-a') as never)
    })
    expect(result.current.messages[0]?.content).toBe('from-b')
  })

  it('does not fetch without a threadId', () => {
    const spy = vi.spyOn(api, 'getThreadHistory')
    renderHook(() => useThreadHistory(null), { wrapper: wrapper() })
    expect(spy).not.toHaveBeenCalled()
  })
})

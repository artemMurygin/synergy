import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadNotFoundError } from './errors'
import type { Thread } from './schema'
import * as threadsApi from './threads.api'
import { useChatStore } from '@/stores/chat.store'
import { threadsQuery, useCreateThread, useDeleteThread, useRenameThread } from './threads.queries'

vi.mock('./threads.api')

const mk = (id: string): Thread => ({
  id,
  title: `Чат ${id}`,
  titleIsCustom: false,
  createdAt: '2026-01-01T00:00:00Z',
  lastActivityAt: '2026-01-02T00:00:00Z',
  running: false
})

function setup(initial?: Thread[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (initial) client.setQueryData(['threads'], initial)
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, invalidate, wrapper }
}

beforeEach(() => {
  useChatStore.setState({ activeThreadId: null })
})

describe('threadsQuery', () => {
  it('uses the threads key and loads the list', async () => {
    vi.mocked(threadsApi.listThreads).mockResolvedValue([mk('a')])
    expect(threadsQuery().queryKey).toEqual(['threads'])
    const { client } = setup()
    await expect(client.fetchQuery(threadsQuery())).resolves.toEqual([mk('a')])
  })
})

describe('useCreateThread', () => {
  it('makes the new thread active and invalidates the list', async () => {
    vi.mocked(threadsApi.createThread).mockResolvedValue(mk('new'))
    const { invalidate, wrapper } = setup()
    const { result } = renderHook(() => useCreateThread(), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(useChatStore.getState().activeThreadId).toBe('new')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['threads'] })
  })
})

describe('useRenameThread', () => {
  it('invalidates the list', async () => {
    vi.mocked(threadsApi.renameThread).mockResolvedValue(mk('a'))
    const { invalidate, wrapper } = setup()
    const { result } = renderHook(() => useRenameThread(), { wrapper })
    await act(() => result.current.mutateAsync({ id: 'a', title: 'Новое' }))
    expect(threadsApi.renameThread).toHaveBeenCalledWith('a', 'Новое')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['threads'] })
  })
})

describe('useDeleteThread', () => {
  const list = [mk('a'), mk('b'), mk('c')]

  it('switches the active thread to a neighbour', async () => {
    vi.mocked(threadsApi.deleteThread).mockResolvedValue(undefined)
    useChatStore.setState({ activeThreadId: 'b' })
    const { invalidate, wrapper } = setup(list)
    const { result } = renderHook(() => useDeleteThread(), { wrapper })
    await act(() => result.current.mutateAsync('b'))
    expect(useChatStore.getState().activeThreadId).toBe('c')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['threads'] })
  })

  it('falls back to the previous thread when the last one is deleted', async () => {
    vi.mocked(threadsApi.deleteThread).mockResolvedValue(undefined)
    useChatStore.setState({ activeThreadId: 'c' })
    const { wrapper } = setup(list)
    const { result } = renderHook(() => useDeleteThread(), { wrapper })
    await act(() => result.current.mutateAsync('c'))
    expect(useChatStore.getState().activeThreadId).toBe('b')
  })

  it('resets the active thread when the list becomes empty', async () => {
    vi.mocked(threadsApi.deleteThread).mockResolvedValue(undefined)
    useChatStore.setState({ activeThreadId: 'a' })
    const { wrapper } = setup([mk('a')])
    const { result } = renderHook(() => useDeleteThread(), { wrapper })
    await act(() => result.current.mutateAsync('a'))
    expect(useChatStore.getState().activeThreadId).toBeNull()
  })

  it('keeps the active thread when another one is deleted', async () => {
    vi.mocked(threadsApi.deleteThread).mockResolvedValue(undefined)
    useChatStore.setState({ activeThreadId: 'a' })
    const { wrapper } = setup(list)
    const { result } = renderHook(() => useDeleteThread(), { wrapper })
    await act(() => result.current.mutateAsync('c'))
    expect(useChatStore.getState().activeThreadId).toBe('a')
  })

  it('treats 404 as success and still invalidates', async () => {
    vi.mocked(threadsApi.deleteThread).mockRejectedValue(new ThreadNotFoundError('gone'))
    useChatStore.setState({ activeThreadId: 'a' })
    const { invalidate, wrapper } = setup(list)
    const { result } = renderHook(() => useDeleteThread(), { wrapper })
    await act(() => result.current.mutateAsync('a'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useChatStore.getState().activeThreadId).toBe('b')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['threads'] })
  })

  it('propagates other errors without touching the active thread', async () => {
    vi.mocked(threadsApi.deleteThread).mockRejectedValue(new Error('boom'))
    useChatStore.setState({ activeThreadId: 'a' })
    const { wrapper } = setup(list)
    const { result } = renderHook(() => useDeleteThread(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('a').catch(() => undefined)
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useChatStore.getState().activeThreadId).toBe('a')
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveSessionId, setActiveSessionId } from '@/shared/active-session'
import { createThread, deleteThread, listThreads, renameThread } from '@/shared/threads-api'
import type { Thread } from '@/shared/threads-api'
import { useChatSessions } from './use-chat-sessions'

vi.mock('@/shared/threads-api')
vi.mock('@/shared/active-session')

function session(id: string, minute: number): Thread {
  return {
    id,
    title: `Чат ${id}`,
    titleIsCustom: false,
    createdAt: '2026-11-05T10:00:00.000Z',
    lastActivityAt: `2026-11-05T10:${String(minute).padStart(2, '0')}:00.000Z`,
    running: false,
  }
}

const A = session('a', 30)
const B = session('b', 20)
const C = session('c', 10)

beforeEach(() => {
  vi.mocked(listThreads).mockResolvedValue([A, B, C])
  vi.mocked(getActiveSessionId).mockResolvedValue(null)
  vi.mocked(setActiveSessionId).mockResolvedValue(undefined)
})

async function ready() {
  const hook = renderHook(() => useChatSessions())
  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready')
  })
  return hook
}

describe('useChatSessions', () => {
  it('starts in loading status', () => {
    const { result } = renderHook(() => useChatSessions())
    expect(result.current.status).toBe('loading')
  })

  it('loads sessions and restores the stored active chat', async () => {
    vi.mocked(getActiveSessionId).mockResolvedValue('b')
    const { result } = await ready()
    expect(result.current.sessions.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.activeId).toBe('b')
  })

  it('falls back to the freshest chat when the stored one is gone', async () => {
    vi.mocked(getActiveSessionId).mockResolvedValue('deleted')
    const { result } = await ready()
    expect(result.current.activeId).toBe('a')
  })

  it('has no active chat and does not create one when the list is empty', async () => {
    vi.mocked(listThreads).mockResolvedValue([])
    const { result } = await ready()
    expect(result.current.activeId).toBeNull()
    expect(createThread).not.toHaveBeenCalled()
  })

  it('reports an error and recovers on reload', async () => {
    vi.mocked(listThreads).mockRejectedValueOnce(new Error('down'))
    const hook = renderHook(() => useChatSessions())
    await waitFor(() => {
      expect(hook.result.current.status).toBe('error')
    })
    await act(async () => {
      await hook.result.current.reload()
    })
    expect(hook.result.current.status).toBe('ready')
    expect(hook.result.current.sessions).toHaveLength(3)
  })

  it('keeps the list during a refresh (no collapse to loading)', async () => {
    const { result } = await ready()
    let resolve: (value: Thread[]) => void = () => undefined
    vi.mocked(listThreads).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    let pendingReload: Promise<void> = Promise.resolve()
    act(() => {
      pendingReload = result.current.reload()
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.sessions).toHaveLength(3)
    await act(async () => {
      resolve([A])
      await pendingReload
    })
    expect(result.current.sessions).toHaveLength(1)
  })

  it('create makes the new chat active and first, and persists it', async () => {
    const created = session('n', 59)
    vi.mocked(createThread).mockResolvedValue(created)
    const { result } = await ready()
    let returned: Thread | undefined
    await act(async () => {
      returned = await result.current.create()
    })
    expect(returned).toEqual(created)
    expect(result.current.activeId).toBe('n')
    expect(result.current.sessions.map((s) => s.id)).toEqual(['n', 'a', 'b', 'c'])
    expect(setActiveSessionId).toHaveBeenCalledWith('n')
  })

  it('a reload that was in flight during create does not switch away from the new chat', async () => {
    const created = session('n', 59)
    vi.mocked(createThread).mockResolvedValue(created)
    const { result } = await ready()
    let resolveList: (list: Thread[]) => void = () => undefined
    vi.mocked(listThreads).mockReturnValueOnce(
      new Promise<Thread[]>((resolve) => {
        resolveList = resolve
      }),
    )
    let reloading: Promise<void> = Promise.resolve()
    act(() => {
      reloading = result.current.reload()
    })
    await act(async () => {
      await result.current.create()
    })
    expect(result.current.activeId).toBe('n')
    await act(async () => {
      resolveList([A, B, C]) // snapshot taken before the new chat existed
      await reloading
    })
    expect(result.current.activeId).toBe('n')
    expect(result.current.sessions.map((s) => s.id)).toEqual(['n', 'a', 'b', 'c'])
  })

  it('select changes the active chat and persists it', async () => {
    const { result } = await ready()
    act(() => {
      result.current.select('c')
    })
    expect(result.current.activeId).toBe('c')
    expect(setActiveSessionId).toHaveBeenCalledWith('c')
  })

  it('rename updates the title in the list', async () => {
    vi.mocked(renameThread).mockResolvedValue({ ...B, title: 'Новое', titleIsCustom: true })
    const { result } = await ready()
    await act(async () => {
      await result.current.rename('b', 'Новое')
    })
    expect(renameThread).toHaveBeenCalledWith('b', 'Новое')
    expect(result.current.sessions.find((s) => s.id === 'b')?.title).toBe('Новое')
  })

  it('remove of a non-active chat keeps the active one', async () => {
    vi.mocked(deleteThread).mockResolvedValue(undefined)
    const { result } = await ready()
    await act(async () => {
      await result.current.remove('c')
    })
    expect(result.current.sessions.map((s) => s.id)).toEqual(['a', 'b'])
    expect(result.current.activeId).toBe('a')
  })

  it('remove of the active chat switches to the freshest remaining', async () => {
    vi.mocked(deleteThread).mockResolvedValue(undefined)
    const { result } = await ready()
    await act(async () => {
      await result.current.remove('a')
    })
    expect(result.current.activeId).toBe('b')
    expect(setActiveSessionId).toHaveBeenLastCalledWith('b')
  })

  it('remove of the last chat leaves the empty state', async () => {
    vi.mocked(listThreads).mockResolvedValue([A])
    vi.mocked(deleteThread).mockResolvedValue(undefined)
    const { result } = await ready()
    await act(async () => {
      await result.current.remove('a')
    })
    expect(result.current.sessions).toEqual([])
    expect(result.current.activeId).toBeNull()
    expect(setActiveSessionId).toHaveBeenLastCalledWith(null)
  })

  it('remove keeps the chat when the server refuses', async () => {
    vi.mocked(deleteThread).mockRejectedValue(new Error('500'))
    const { result } = await ready()
    await act(async () => {
      await expect(result.current.remove('a')).rejects.toThrow('500')
    })
    expect(result.current.sessions).toHaveLength(3)
    expect(result.current.activeId).toBe('a')
  })
})

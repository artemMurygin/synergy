import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getThread } from '@/shared/threads-api'
import type { ThreadHistory } from '@/shared/threads-api'
import { useThreadRunStatus } from './use-thread-run-status'

vi.mock('@/shared/threads-api')

function history(running: boolean): ThreadHistory {
  return {
    running,
    messages: running ? [] : [{ id: 'm1', role: 'assistant', content: 'готово' }],
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

async function tick(ms = 3000): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useThreadRunStatus', () => {
  it('polls the thread every 3 s while running', async () => {
    vi.mocked(getThread).mockResolvedValue(history(true))
    renderHook(() => useThreadRunStatus({ threadId: 't1', running: true, onFinished: vi.fn() }))
    expect(getThread).not.toHaveBeenCalled()
    await tick()
    expect(getThread).toHaveBeenCalledTimes(1)
    expect(getThread).toHaveBeenCalledWith('t1')
    await tick()
    expect(getThread).toHaveBeenCalledTimes(2)
  })

  it('does not poll when not running', async () => {
    renderHook(() => useThreadRunStatus({ threadId: 't1', running: false, onFinished: vi.fn() }))
    await tick(10000)
    expect(getThread).not.toHaveBeenCalled()
  })

  it('does not poll without a thread', async () => {
    renderHook(() => useThreadRunStatus({ threadId: null, running: true, onFinished: vi.fn() }))
    await tick(10000)
    expect(getThread).not.toHaveBeenCalled()
  })

  it('stops and calls onFinished once when the run finishes', async () => {
    const onFinished = vi.fn()
    vi.mocked(getThread).mockResolvedValueOnce(history(true)).mockResolvedValue(history(false))
    const { result } = renderHook(() =>
      useThreadRunStatus({ threadId: 't1', running: true, onFinished }),
    )
    await tick()
    expect(result.current.running).toBe(true)
    expect(onFinished).not.toHaveBeenCalled()
    await tick()
    expect(result.current.running).toBe(false)
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenCalledWith(history(false))
    await tick(10000)
    expect(getThread).toHaveBeenCalledTimes(2)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('keeps polling after a request error', async () => {
    const onFinished = vi.fn()
    vi.mocked(getThread)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(history(false))
    const { result } = renderHook(() =>
      useThreadRunStatus({ threadId: 't1', running: true, onFinished }),
    )
    await tick()
    expect(result.current.running).toBe(true)
    expect(onFinished).not.toHaveBeenCalled()
    await tick()
    expect(getThread).toHaveBeenCalledTimes(2)
    expect(result.current.running).toBe(false)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('clears the timer on unmount', async () => {
    vi.mocked(getThread).mockResolvedValue(history(true))
    const { unmount } = renderHook(() =>
      useThreadRunStatus({ threadId: 't1', running: true, onFinished: vi.fn() }),
    )
    unmount()
    await tick(10000)
    expect(getThread).not.toHaveBeenCalled()
  })

  it('switches polling to the new thread and ignores a late answer of the old one', async () => {
    const onFinished = vi.fn()
    let resolveOld: (value: ThreadHistory) => void = () => undefined
    vi.mocked(getThread).mockImplementation((id) =>
      id === 't1'
        ? new Promise<ThreadHistory>((resolve) => {
            resolveOld = resolve
          })
        : Promise.resolve(history(true)),
    )
    const { rerender, result } = renderHook(
      ({ threadId }: { threadId: string }) =>
        useThreadRunStatus({ threadId, running: true, onFinished }),
      { initialProps: { threadId: 't1' } },
    )
    await tick()
    expect(getThread).toHaveBeenLastCalledWith('t1')
    rerender({ threadId: 't2' })
    await act(async () => {
      resolveOld(history(false))
      await Promise.resolve()
    })
    expect(onFinished).not.toHaveBeenCalled()
    expect(result.current.running).toBe(true)
    await tick()
    expect(getThread).toHaveBeenLastCalledWith('t2')
  })

  it('follows the running flag of a newly opened thread', async () => {
    vi.mocked(getThread).mockResolvedValue(history(true))
    const { rerender, result } = renderHook(
      ({ threadId, running }: { threadId: string; running: boolean }) =>
        useThreadRunStatus({ threadId, running, onFinished: vi.fn() }),
      { initialProps: { threadId: 't1', running: false } },
    )
    expect(result.current.running).toBe(false)
    rerender({ threadId: 't2', running: true })
    expect(result.current.running).toBe(true)
    await tick()
    expect(getThread).toHaveBeenCalledWith('t2')
  })

  it('markStopped hides the indicator and stops polling', async () => {
    vi.mocked(getThread).mockResolvedValue(history(true))
    const { result } = renderHook(() =>
      useThreadRunStatus({ threadId: 't1', running: true, onFinished: vi.fn() }),
    )
    act(() => {
      result.current.markStopped()
    })
    expect(result.current.running).toBe(false)
    await tick(10000)
    expect(getThread).not.toHaveBeenCalled()
  })
})

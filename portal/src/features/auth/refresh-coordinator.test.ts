import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/errors'
import { createRefreshCoordinator } from './refresh-coordinator'

const expired = () => new ApiError('unauthorized', 'expired', 401, 'TOKEN_EXPIRED')

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('refresh coordinator', () => {
  it('returns the result without refreshing when the request succeeds', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { run } = createRefreshCoordinator({ refresh, onSessionLost: vi.fn() })
    await expect(run(() => Promise.resolve('ok'))).resolves.toBe('ok')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes once and repeats the request once after TOKEN_EXPIRED', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { run } = createRefreshCoordinator({ refresh, onSessionLost: vi.fn() })
    const fn = vi.fn().mockRejectedValueOnce(expired()).mockResolvedValueOnce('second')
    await expect(run(fn)).resolves.toBe('second')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('parallel requests wait for one shared refresh', async () => {
    const gate = deferred()
    const refresh = vi.fn(() => gate.promise)
    const { run } = createRefreshCoordinator({ refresh, onSessionLost: vi.fn() })
    const make = () => vi.fn().mockRejectedValueOnce(expired()).mockResolvedValueOnce('again')
    const [a, b, c] = [make(), make(), make()]
    const all = Promise.all([run(a), run(b), run(c)])
    await Promise.resolve()
    await Promise.resolve()
    expect(refresh).toHaveBeenCalledTimes(1)
    gate.resolve()
    await expect(all).resolves.toEqual(['again', 'again', 'again'])
    expect(refresh).toHaveBeenCalledTimes(1)
    for (const fn of [a, b, c]) expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not loop: a second 401 after the retry is thrown and the session is reset', async () => {
    const onSessionLost = vi.fn()
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { run } = createRefreshCoordinator({ refresh, onSessionLost })
    const fn = vi.fn().mockRejectedValue(expired())
    await expect(run(fn)).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onSessionLost).toHaveBeenCalledTimes(1)
  })

  it('resets the session and throws when the refresh fails', async () => {
    const onSessionLost = vi.fn()
    const refresh = vi.fn().mockRejectedValue(new ApiError('unauthorized', 'bad', 401, 'TOKEN_INVALID'))
    const { run } = createRefreshCoordinator({ refresh, onSessionLost })
    const fn = vi.fn().mockRejectedValue(expired())
    await expect(run(fn)).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(onSessionLost).toHaveBeenCalledTimes(1)
  })

  it('keeps the session when the refresh failed only because the server is unavailable', async () => {
    const onSessionLost = vi.fn()
    const refresh = vi.fn().mockRejectedValue(new ApiError('unavailable', 'down'))
    const { run } = createRefreshCoordinator({ refresh, onSessionLost })
    await expect(run(() => Promise.reject(expired()))).rejects.toMatchObject({ kind: 'unavailable' })
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('does not refresh for other errors', async () => {
    const refresh = vi.fn()
    const { run } = createRefreshCoordinator({ refresh, onSessionLost: vi.fn() })
    const err = new ApiError('forbidden', 'no', 403)
    await expect(run(() => Promise.reject(err))).rejects.toBe(err)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('a later expiry starts a new refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { run } = createRefreshCoordinator({ refresh, onSessionLost: vi.fn() })
    for (let i = 0; i < 2; i++) {
      const fn = vi.fn().mockRejectedValueOnce(expired()).mockResolvedValueOnce('x')
      await run(fn)
    }
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})

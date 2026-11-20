import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChromeFake } from '@/background/notifications/chrome-fake.testing'
import type { ChromeFake } from '@/background/notifications/chrome-fake.testing'
import { setPendingTarget } from '@/shared/notifications/pending-target'
import { usePendingTarget } from './use-pending-target'

let chromeFake: ChromeFake

async function setAndAnnounce(target: Parameters<typeof setPendingTarget>[0]) {
  await setPendingTarget(target)
  chromeFake.storage.onChanged.emit({ pendingTarget: { newValue: target } }, 'session')
}

beforeEach(() => {
  chromeFake = installChromeFake()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('usePendingTarget', () => {
  it('takes the stored target on mount and navigates to it', async () => {
    await setPendingTarget({ kind: 'task', taskId: 't1' })
    const onTarget = vi.fn()
    renderHook(() => {
      usePendingTarget(onTarget, true)
    })
    await waitFor(() => {
      expect(onTarget).toHaveBeenCalledWith({ kind: 'task', taskId: 't1' })
    })
    expect(chromeFake.storage.session.store.pendingTarget).toBeUndefined()
  })

  it('takes a chat target', async () => {
    await setPendingTarget({ kind: 'chat', chatId: 'c1' })
    const onTarget = vi.fn()
    renderHook(() => {
      usePendingTarget(onTarget, true)
    })
    await waitFor(() => {
      expect(onTarget).toHaveBeenCalledWith({ kind: 'chat', chatId: 'c1' })
    })
  })

  it('does nothing on mount when there is no target', async () => {
    const onTarget = vi.fn()
    renderHook(() => {
      usePendingTarget(onTarget, true)
    })
    await waitFor(() => {
      expect(chromeFake.storage.session.get).toHaveBeenCalled()
    })
    expect(onTarget).not.toHaveBeenCalled()
  })

  it('reacts to a target set while the panel is open', async () => {
    const onTarget = vi.fn()
    renderHook(() => {
      usePendingTarget(onTarget, true)
    })
    await setAndAnnounce({ kind: 'notifications' })
    await waitFor(() => {
      expect(onTarget).toHaveBeenCalledWith({ kind: 'notifications' })
    })
  })

  it('waits until enabled before taking the target', async () => {
    await setPendingTarget({ kind: 'task', taskId: 't1' })
    const onTarget = vi.fn()
    const { rerender } = renderHook(
      ({ isEnabled }) => {
        usePendingTarget(onTarget, isEnabled)
      },
      { initialProps: { isEnabled: false } },
    )
    await Promise.resolve()
    expect(onTarget).not.toHaveBeenCalled()
    expect(chromeFake.storage.session.store.pendingTarget).toEqual({ kind: 'task', taskId: 't1' })
    rerender({ isEnabled: true })
    await waitFor(() => {
      expect(onTarget).toHaveBeenCalledWith({ kind: 'task', taskId: 't1' })
    })
  })

  it('stops listening after unmount', async () => {
    const onTarget = vi.fn()
    const { unmount } = renderHook(() => {
      usePendingTarget(onTarget, true)
    })
    unmount()
    await setAndAnnounce({ kind: 'notifications' })
    await Promise.resolve()
    expect(onTarget).not.toHaveBeenCalled()
  })
})

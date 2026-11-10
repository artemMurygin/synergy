import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Notification } from '@/lib/backend/notifications.schema'
import { MAX_VISIBLE_TOASTS, TOAST_DURATION_MS, useNotificationsStore } from './notifications.store'

const mk = (id: string): Notification => ({
  id,
  type: 'task.assigned',
  title: `Уведомление ${id}`,
  body: 'Текст',
  target: { type: 'task', id: `task-${id}` },
  actorId: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  readAt: null
})

const visibleIds = (): string[] => useNotificationsStore.getState().toasts.map((toast) => toast.id)

beforeEach(() => {
  vi.useFakeTimers()
  useNotificationsStore.getState().reset()
})

afterEach(() => {
  useNotificationsStore.getState().reset()
  vi.useRealTimers()
})

describe('useNotificationsStore', () => {
  it('shows toasts in arrival order, the newest last', () => {
    const { showToast } = useNotificationsStore.getState()
    showToast(mk('a'))
    showToast(mk('b'))
    expect(visibleIds()).toEqual(['a', 'b'])
  })

  it('keeps at most three toasts, dropping the oldest', () => {
    const { showToast } = useNotificationsStore.getState()
    for (const id of ['a', 'b', 'c', 'd']) showToast(mk(id))
    expect(MAX_VISIBLE_TOASTS).toBe(3)
    expect(visibleIds()).toEqual(['b', 'c', 'd'])
  })

  it('never shows a toast twice for the same id', () => {
    const { showToast, dismiss } = useNotificationsStore.getState()
    showToast(mk('a'))
    showToast(mk('a'))
    expect(visibleIds()).toEqual(['a'])
    dismiss('a')
    showToast(mk('a'))
    expect(visibleIds()).toEqual([])
  })

  it('hides a toast after 6 seconds', () => {
    useNotificationsStore.getState().showToast(mk('a'))
    expect(TOAST_DURATION_MS).toBe(6_000)
    vi.advanceTimersByTime(5_999)
    expect(visibleIds()).toEqual(['a'])
    vi.advanceTimersByTime(1)
    expect(visibleIds()).toEqual([])
  })

  it('pauses the timer while hovered and resumes with the remaining time', () => {
    const { showToast, pause, resume } = useNotificationsStore.getState()
    showToast(mk('a'))
    vi.advanceTimersByTime(4_000)
    pause('a')
    vi.advanceTimersByTime(60_000)
    expect(visibleIds()).toEqual(['a'])
    resume('a')
    vi.advanceTimersByTime(1_999)
    expect(visibleIds()).toEqual(['a'])
    vi.advanceTimersByTime(1)
    expect(visibleIds()).toEqual([])
  })

  it('pausing one toast does not stop the others', () => {
    const { showToast, pause } = useNotificationsStore.getState()
    showToast(mk('a'))
    showToast(mk('b'))
    pause('a')
    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(visibleIds()).toEqual(['a'])
  })

  it('dismiss removes the toast and cancels its timer', () => {
    const { showToast, dismiss } = useNotificationsStore.getState()
    showToast(mk('a'))
    showToast(mk('b'))
    dismiss('a')
    expect(visibleIds()).toEqual(['b'])
    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(visibleIds()).toEqual([])
  })

  it('a dropped toast does not leave a timer behind', () => {
    const { showToast } = useNotificationsStore.getState()
    for (const id of ['a', 'b', 'c', 'd']) showToast(mk(id))
    expect(vi.getTimerCount()).toBe(3)
  })

  it('keeps a notice until it is cleared', () => {
    const { showNotice, clearNotice } = useNotificationsStore.getState()
    showNotice('Задача не найдена')
    expect(useNotificationsStore.getState().notice).toBe('Задача не найдена')
    clearNotice()
    expect(useNotificationsStore.getState().notice).toBeNull()
  })

  it('reset clears toasts, timers, shown ids and the notice', () => {
    const { showToast, showNotice, reset } = useNotificationsStore.getState()
    showToast(mk('a'))
    showNotice('Задача не найдена')
    reset()
    expect(visibleIds()).toEqual([])
    expect(useNotificationsStore.getState().notice).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    useNotificationsStore.getState().showToast(mk('a'))
    expect(visibleIds()).toEqual(['a'])
  })
})

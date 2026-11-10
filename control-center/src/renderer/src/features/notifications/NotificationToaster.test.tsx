import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as notificationsApi from '@/lib/backend/notifications.api'
import * as tasksApi from '@/lib/backend/tasks.api'
import { TOAST_DURATION_MS, useNotificationsStore } from '@/stores/notifications.store'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { NotificationToast } from './NotificationToast'
import { NotificationToaster } from './NotificationToaster'
import { createTestQueryClient, createWrapper, makeNotification } from './test-utils'

vi.mock('@/lib/backend/notifications.api')
vi.mock('@/lib/backend/tasks.api')

afterEach(() => {
  cleanup()
  useNotificationsStore.getState().reset()
})

beforeEach(() => {
  useNotificationsStore.getState().reset()
  useTasksStore.setState(INITIAL_TASKS_STATE)
  useUiStore.setState({ section: 'chats' })
  vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue({ unreadCount: 0 })
  vi.mocked(tasksApi.getTask).mockReturnValue(new Promise(() => {}))
})

function mountToaster() {
  render(<NotificationToaster />, { wrapper: createWrapper(createTestQueryClient()) })
  return userEvent.setup()
}

const region = () => screen.getByRole('region', { name: 'Новые уведомления' })
const toasts = () => within(region()).queryAllByRole('group')

describe('NotificationToast', () => {
  it('shows the title, the text and the «Открыть задачу» hint', () => {
    render(<NotificationToast notification={makeNotification('1')} onOpen={() => {}} onDismiss={() => {}} />)
    const toast = screen.getByRole('group', { name: 'Уведомление 1' })
    expect(toast.textContent).toContain('Текст')
    expect(toast.textContent).toContain('Открыть задачу')
  })

  it('calls onOpen on click and onDismiss on the cross', async () => {
    const onOpen = vi.fn()
    const onDismiss = vi.fn()
    const notification = makeNotification('1')
    render(<NotificationToast notification={notification} onOpen={onOpen} onDismiss={onDismiss} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(onDismiss).toHaveBeenCalledWith('1')
    expect(onOpen).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Уведомление 1/ }))
    expect(onOpen).toHaveBeenCalledWith(notification)
  })
})

describe('NotificationToaster', () => {
  it('renders nothing visible without toasts', () => {
    mountToaster()
    expect(toasts()).toHaveLength(0)
  })

  it('shows a toast from the store', () => {
    mountToaster()
    act(() => useNotificationsStore.getState().showToast(makeNotification('1')))
    expect(within(region()).getByRole('group', { name: 'Уведомление 1' })).toBeTruthy()
  })

  it('keeps at most 3 toasts, the newest last', () => {
    mountToaster()
    act(() => {
      for (const id of ['1', '2', '3', '4']) useNotificationsStore.getState().showToast(makeNotification(id))
    })
    expect(toasts().map((toast) => toast.getAttribute('aria-label'))).toEqual([
      'Уведомление 2',
      'Уведомление 3',
      'Уведомление 4'
    ])
  })

  it('opens the notification on click and closes the toast', async () => {
    const user = mountToaster()
    act(() => useNotificationsStore.getState().showToast(makeNotification('1')))
    await user.click(screen.getByRole('button', { name: /Уведомление 1/ }))
    expect(useUiStore.getState().section).toBe('tasks')
    expect(useTasksStore.getState().selectedTaskId).toBe('task-1')
    await waitFor(() => expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('1'))
    expect(toasts()).toHaveLength(0)
  })

  it('dismisses a toast with the cross without opening it', async () => {
    const user = mountToaster()
    act(() => useNotificationsStore.getState().showToast(makeNotification('1')))
    await user.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(toasts()).toHaveLength(0)
    expect(useUiStore.getState().section).toBe('chats')
    expect(notificationsApi.markNotificationRead).not.toHaveBeenCalled()
  })

  it('keeps a hovered toast past the hide timeout and hides it after leave', () => {
    vi.useFakeTimers()
    try {
      mountToaster()
      act(() => useNotificationsStore.getState().showToast(makeNotification('1')))
      const toast = within(region()).getByRole('group', { name: 'Уведомление 1' })
      fireEvent.mouseEnter(toast)
      act(() => vi.advanceTimersByTime(TOAST_DURATION_MS + 1_000))
      expect(toasts()).toHaveLength(1)
      fireEvent.mouseLeave(toast)
      act(() => vi.advanceTimersByTime(TOAST_DURATION_MS))
      expect(toasts()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

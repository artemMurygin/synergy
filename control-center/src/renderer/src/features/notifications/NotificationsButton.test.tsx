import '@/features/tasks/test-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as notificationsApi from '@/lib/backend/notifications.api'
import { NOTIFICATIONS_PAGE_SIZE } from '@/lib/backend/notifications.queries'
import * as tasksApi from '@/lib/backend/tasks.api'
import { useNotificationsStore } from '@/stores/notifications.store'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { NotificationsButton } from './NotificationsButton'
import { createTestQueryClient, createWrapper, makeNotification } from './test-utils'

vi.mock('@/lib/backend/notifications.api')
vi.mock('@/lib/backend/tasks.api')

afterEach(cleanup)

function mount() {
  render(<NotificationsButton />, { wrapper: createWrapper(createTestQueryClient()) })
  return userEvent.setup()
}

const bell = () => screen.getByRole('button', { name: /^Уведомления/ })

beforeEach(() => {
  vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 5 })
  vi.mocked(notificationsApi.listNotifications).mockResolvedValue({
    items: [makeNotification('1')],
    total: 1,
    limit: NOTIFICATIONS_PAGE_SIZE,
    page: 0
  })
  vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue({ unreadCount: 4 })
  vi.mocked(tasksApi.getTask).mockReturnValue(new Promise(() => {}))
  useTasksStore.setState(INITIAL_TASKS_STATE)
  useUiStore.setState({ section: 'chats' })
  useNotificationsStore.getState().reset()
})

describe('NotificationsButton', () => {
  it('shows the unread count from unreadCountQuery', async () => {
    mount()
    expect(await screen.findByText('5')).toBeTruthy()
    expect(bell().getAttribute('aria-label')).toBe('Уведомления, непрочитанных: 5')
  })

  it('hides the badge with no unread', async () => {
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 0 })
    mount()
    await waitFor(() => { expect(notificationsApi.getUnreadCount).toHaveBeenCalled(); })
    expect(bell().textContent).toBe('')
  })

  it('opens the popover with the list on click', async () => {
    const user = mount()
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(bell())
    expect(await screen.findByRole('dialog', { name: 'Уведомления' })).toBeTruthy()
    expect(await screen.findByText('Уведомление 1')).toBeTruthy()
    expect(notificationsApi.listNotifications).toHaveBeenCalledTimes(1)
    expect(bell().getAttribute('aria-expanded')).toBe('true')
  })

  it('closes the popover and opens the task when a notification is clicked', async () => {
    const user = mount()
    await user.click(bell())
    await user.click(await screen.findByRole('button', { name: /Уведомление 1/ }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); })
    expect(useUiStore.getState().section).toBe('tasks')
    expect(useTasksStore.getState().selectedTaskId).toBe('task-1')
    expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('1')
  })
})

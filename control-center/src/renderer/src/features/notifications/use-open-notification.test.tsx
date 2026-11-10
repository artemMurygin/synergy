import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskNotFoundError } from '@/lib/backend/errors'
import * as notificationsApi from '@/lib/backend/notifications.api'
import * as tasksApi from '@/lib/backend/tasks.api'
import type { TaskDetails } from '@/lib/backend/tasks.schema'
import { useNotificationsStore } from '@/stores/notifications.store'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { createTestQueryClient, createWrapper, makeNotification } from './test-utils'
import { TASK_NOT_FOUND_NOTICE, useOpenNotification } from './use-open-notification'

vi.mock('@/lib/backend/notifications.api')
vi.mock('@/lib/backend/tasks.api')

const task: TaskDetails = {
  id: 'task-a',
  title: 'Задача',
  description: '',
  status: 'todo',
  deadline: null,
  creator: { id: 'u2', login: 'anna' },
  assignee: { id: 'u1', login: 'admin' },
  watchers: [],
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  completedAt: null,
  attachmentCount: 0,
  attachments: []
}

function setup() {
  const client = createTestQueryClient()
  const { result } = renderHook(() => useOpenNotification(), { wrapper: createWrapper(client) })
  return { open: result.current, client }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue({ unreadCount: 0 })
  vi.mocked(tasksApi.getTask).mockResolvedValue(task)
  useTasksStore.setState(INITIAL_TASKS_STATE)
  useUiStore.setState({ section: 'chats' })
  useNotificationsStore.getState().reset()
})

afterEach(() => {
  useNotificationsStore.getState().reset()
})

describe('useOpenNotification', () => {
  it('marks the notification read and opens its task', async () => {
    const { open } = setup()
    act(() => open(makeNotification('a')))
    await waitFor(() => expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('a'))
    expect(useUiStore.getState().section).toBe('tasks')
    expect(useTasksStore.getState().selectedTaskId).toBe('task-a')
    await waitFor(() => expect(tasksApi.getTask).toHaveBeenCalledWith('task-a'))
    expect(useNotificationsStore.getState().notice).toBeNull()
  })

  it('does not mark an already read notification again', async () => {
    const { open } = setup()
    act(() => open(makeNotification('a', '2026-11-10T10:01:00.000Z')))
    expect(useTasksStore.getState().selectedTaskId).toBe('task-a')
    await waitFor(() => expect(tasksApi.getTask).toHaveBeenCalled())
    expect(notificationsApi.markNotificationRead).not.toHaveBeenCalled()
  })

  it('closes the toast of the opened notification', () => {
    useNotificationsStore.getState().showToast(makeNotification('a'))
    const { open } = setup()
    act(() => open(makeNotification('a')))
    expect(useNotificationsStore.getState().toasts).toEqual([])
  })

  it('reports a missing task and keeps the notification read', async () => {
    vi.mocked(tasksApi.getTask).mockRejectedValue(new TaskNotFoundError('Task not found'))
    const { open } = setup()
    act(() => open(makeNotification('a')))
    await waitFor(() => expect(useNotificationsStore.getState().notice).toBe(TASK_NOT_FOUND_NOTICE))
    expect(TASK_NOT_FOUND_NOTICE).toBe('Задача не найдена')
    expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('a')
    expect(useUiStore.getState().section).toBe('tasks')
  })

  it('stays quiet about other task loading errors', async () => {
    vi.mocked(tasksApi.getTask).mockRejectedValue(new Error('offline'))
    const { open } = setup()
    act(() => open(makeNotification('a')))
    await waitFor(() => expect(tasksApi.getTask).toHaveBeenCalled())
    await Promise.resolve()
    expect(useNotificationsStore.getState().notice).toBeNull()
  })

  it('only marks read a notification about something other than a task', async () => {
    const { open } = setup()
    const other = { ...makeNotification('a'), target: { type: 'deal', id: 'd1' } }
    act(() => open(other))
    await waitFor(() => expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('a'))
    expect(useUiStore.getState().section).toBe('chats')
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
  })
})

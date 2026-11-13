import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskNotFoundError, ThreadNotFoundError } from '@/lib/backend/errors'
import * as notificationsApi from '@/lib/backend/notifications.api'
import * as tasksApi from '@/lib/backend/tasks.api'
import * as threadsApi from '@/lib/backend/threads.api'
import { useChatStore } from '@/stores/chat.store'
import type { TaskDetails } from '@/lib/backend/tasks.schema'
import { useNotificationsStore } from '@/stores/notifications.store'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { createTestQueryClient, createWrapper, installPortalBridgeMock, makeNotification } from './test-utils'
import {
  CHAT_NOT_FOUND_NOTICE,
  PORTAL_LINK_INVALID_NOTICE,
  PORTAL_UNAVAILABLE_NOTICE,
  TASK_NOT_FOUND_NOTICE,
  useOpenNotification
} from './use-open-notification'

vi.mock('@/lib/backend/notifications.api')
vi.mock('@/lib/backend/tasks.api')
vi.mock('@/lib/backend/threads.api')

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
  useChatStore.setState({ activeThreadId: null })
  vi.mocked(threadsApi.getThreadHistory).mockResolvedValue({ running: false, messages: [] })
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

  describe('meeting transcript', () => {
    const ready = {
      ...makeNotification('m'),
      type: 'meeting-transcript.ready',
      title: 'Расшифровка готова',
      body: 'встреча-12-ноя.m4a',
      target: { type: 'chat', id: 'chat-7' }
    }

    it('opens the chats section and that chat', async () => {
      useUiStore.setState({ section: 'tasks' })
      const { open } = setup()
      act(() => open(ready))
      expect(useUiStore.getState().section).toBe('chats')
      expect(useChatStore.getState().activeThreadId).toBe('chat-7')
      await waitFor(() => expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('m'))
      await waitFor(() => expect(threadsApi.getThreadHistory).toHaveBeenCalledWith('chat-7'))
      expect(useNotificationsStore.getState().notice).toBeNull()
      expect(useTasksStore.getState().selectedTaskId).toBeNull()
    })

    it('reports a deleted chat', async () => {
      vi.mocked(threadsApi.getThreadHistory).mockRejectedValue(new ThreadNotFoundError('Thread not found'))
      const { open } = setup()
      act(() => open(ready))
      await waitFor(() => expect(useNotificationsStore.getState().notice).toBe(CHAT_NOT_FOUND_NOTICE))
      expect(CHAT_NOT_FOUND_NOTICE).toBe('Чат не найден')
    })

    it('stays quiet about other chat loading errors', async () => {
      vi.mocked(threadsApi.getThreadHistory).mockRejectedValue(new Error('offline'))
      const { open } = setup()
      act(() => open(ready))
      await waitFor(() => expect(threadsApi.getThreadHistory).toHaveBeenCalled())
      await Promise.resolve()
      expect(useNotificationsStore.getState().notice).toBeNull()
    })
  })

  describe('request', () => {
    const accepted = {
      ...makeNotification('q'),
      type: 'request.accepted',
      target: { type: 'request', id: 'req 7' }
    }

    it('marks read and asks the main process to open the request in the portal', async () => {
      const { openRequest } = installPortalBridgeMock('opened')
      useUiStore.setState({ section: 'tasks' })
      const { open } = setup()
      act(() => open(accepted))
      await waitFor(() => expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('q'))
      await waitFor(() => expect(openRequest).toHaveBeenCalledWith('req 7'))
      expect(useNotificationsStore.getState().notice).toBeNull()
      expect(useUiStore.getState().section).toBe('tasks')
      expect(useTasksStore.getState().selectedTaskId).toBeNull()
    })

    it('says the portal is unavailable when it is not configured, notification stays read', async () => {
      installPortalBridgeMock('unavailable')
      const { open } = setup()
      act(() => open(accepted))
      await waitFor(() => expect(useNotificationsStore.getState().notice).toBe(PORTAL_UNAVAILABLE_NOTICE))
      expect(PORTAL_UNAVAILABLE_NOTICE).toBe('Портал недоступен')
      expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('q')
    })

    it('shows a clear message for an identifier that cannot form a portal address', async () => {
      installPortalBridgeMock('invalid')
      const { open } = setup()
      act(() => open(accepted))
      await waitFor(() => expect(useNotificationsStore.getState().notice).toBe(PORTAL_LINK_INVALID_NOTICE))
    })

    it('does not break when the bridge call fails', async () => {
      const { openRequest } = installPortalBridgeMock('opened')
      openRequest.mockRejectedValue(new Error('ipc'))
      const { open } = setup()
      act(() => open(accepted))
      await waitFor(() => expect(useNotificationsStore.getState().notice).toBe(PORTAL_UNAVAILABLE_NOTICE))
    })

    it('does not mark an already read notification again', async () => {
      const { openRequest } = installPortalBridgeMock('opened')
      const { open } = setup()
      act(() => open({ ...accepted, readAt: '2026-11-10T10:01:00.000Z' }))
      await waitFor(() => expect(openRequest).toHaveBeenCalled())
      expect(notificationsApi.markNotificationRead).not.toHaveBeenCalled()
    })

    it('leaves task and chat clicks unchanged (no portal call)', async () => {
      const { openRequest } = installPortalBridgeMock('opened')
      const { open } = setup()
      act(() => open(makeNotification('a')))
      await waitFor(() => expect(tasksApi.getTask).toHaveBeenCalled())
      expect(openRequest).not.toHaveBeenCalled()
    })
  })
})

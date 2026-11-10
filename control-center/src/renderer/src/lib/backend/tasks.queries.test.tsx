import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError, TaskNotFoundError } from './errors'
import * as tasksApi from './tasks.api'
import type { Task, TaskDetails, TaskPage } from './tasks.schema'
import * as usersApi from './users.api'
import { useTasksStore } from '@/stores/tasks.store'
import { INITIAL_TASKS_STATE } from '@/stores/tasks.store'
import {
  taskQuery,
  tasksQuery,
  useCreateTask,
  useDeleteAttachment,
  useDeleteTask,
  useTask,
  useUpdateTask,
  useUploadAttachment,
  useUsersSearch
} from './tasks.queries'

vi.mock('./tasks.api')
vi.mock('./users.api')

const user = { id: 'u1', login: 'ann' }
const mk = (id: string, status: Task['status'] = 'todo'): Task => ({
  id,
  title: `Задача ${id}`,
  description: '',
  status,
  deadline: null,
  creator: user,
  assignee: null,
  watchers: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  completedAt: null,
  attachmentCount: 0
})
const page = (items: Task[], p = 1): TaskPage => ({ items, total: items.length, limit: 20, page: p })
const details = (id: string, status: Task['status'] = 'todo'): TaskDetails => ({
  ...mk(id, status),
  attachments: []
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, invalidate, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
  useTasksStore.setState(INITIAL_TASKS_STATE)
})

describe('tasksQuery', () => {
  it('keys by filters and loads the page', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([mk('a')]))
    const filters = { status: 'done' as const, page: 2 }
    const { client } = setup()
    await expect(client.fetchQuery(tasksQuery(filters))).resolves.toEqual(page([mk('a')]))
    expect(tasksApi.listTasks).toHaveBeenCalledWith(filters)
    expect(tasksQuery(filters).queryKey).toEqual(['tasks', 'list', filters])
  })

  it('keeps the previous page visible while the next one loads', async () => {
    let resolveSecond: (p: TaskPage) => void = () => {}
    vi.mocked(tasksApi.listTasks)
      .mockResolvedValueOnce(page([mk('a')], 1))
      .mockImplementationOnce(() => new Promise((r) => (resolveSecond = r)))
    const { wrapper } = setup()
    const hook = renderHook(({ p }) => useQuery(tasksQuery({ page: p })), {
      wrapper,
      initialProps: { p: 1 }
    })
    await waitFor(() => expect(hook.result.current.data?.items[0].id).toBe('a'))
    hook.rerender({ p: 2 })
    expect(hook.result.current.data?.items[0].id).toBe('a')
    expect(hook.result.current.isPlaceholderData).toBe(true)
    await act(async () => resolveSecond(page([mk('b')], 2)))
    await waitFor(() => expect(hook.result.current.data?.items[0].id).toBe('b'))
  })
})

describe('taskQuery', () => {
  it('loads details by id', async () => {
    vi.mocked(tasksApi.getTask).mockResolvedValue(details('a'))
    const { client } = setup()
    expect(taskQuery('a').queryKey).toEqual(['tasks', 'detail', 'a'])
    await expect(client.fetchQuery(taskQuery('a'))).resolves.toEqual(details('a'))
  })
})

describe('useTask', () => {
  it('on 404 removes the task from list and detail caches', async () => {
    vi.mocked(tasksApi.getTask).mockRejectedValue(new TaskNotFoundError('нет'))
    const { client, wrapper } = setup()
    client.setQueryData(['tasks', 'list', {}], page([mk('a'), mk('b')]))
    renderHook(() => useTask('a'), { wrapper })
    await waitFor(() =>
      expect(client.getQueryData<TaskPage>(['tasks', 'list', {}])?.items.map((t) => t.id)).toEqual([
        'b'
      ])
    )
    expect(client.getQueryData(['tasks', 'detail', 'a'])).toBeUndefined()
  })

  it('does not fetch without an id', () => {
    const { wrapper } = setup()
    renderHook(() => useTask(null), { wrapper })
    expect(tasksApi.getTask).not.toHaveBeenCalled()
  })
})

describe('useCreateTask', () => {
  it('invalidates the lists and opens the new task', async () => {
    vi.mocked(tasksApi.createTask).mockResolvedValue(mk('new'))
    const { invalidate, wrapper } = setup()
    const { result } = renderHook(() => useCreateTask(), { wrapper })
    await act(() => result.current.mutateAsync({ title: 'Новая' }))
    expect(tasksApi.createTask).toHaveBeenCalledWith({ title: 'Новая' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] })
    expect(useTasksStore.getState().selectedTaskId).toBe('new')
  })
})

describe('useUpdateTask', () => {
  const listKey = ['tasks', 'list', {}]

  it('applies the new status to list and details before the server answers', async () => {
    let resolve: (t: Task) => void = () => {}
    vi.mocked(tasksApi.updateTask).mockImplementation(() => new Promise((r) => (resolve = r)))
    const { client, wrapper } = setup()
    client.setQueryData(listKey, page([mk('a'), mk('b')]))
    client.setQueryData(['tasks', 'detail', 'a'], details('a'))
    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    act(() => result.current.mutate({ id: 'a', patch: { status: 'done' } }))
    await waitFor(() =>
      expect(client.getQueryData<TaskPage>(listKey)?.items[0].status).toBe('done')
    )
    expect(client.getQueryData<TaskDetails>(['tasks', 'detail', 'a'])?.status).toBe('done')
    expect(client.getQueryData<TaskPage>(listKey)?.items[1].status).toBe('todo')
    await act(async () => resolve({ ...mk('a', 'done'), completedAt: '2026-01-02T00:00:00Z' }))
  })

  it('rolls back and rethrows on a server error', async () => {
    vi.mocked(tasksApi.updateTask).mockRejectedValue(new BackendError('сбой'))
    const { client, wrapper } = setup()
    client.setQueryData(listKey, page([mk('a')]))
    client.setQueryData(['tasks', 'detail', 'a'], details('a'))
    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: 'a', patch: { status: 'done' } })
      ).rejects.toThrow('сбой')
    })
    expect(client.getQueryData<TaskPage>(listKey)?.items[0].status).toBe('todo')
    expect(client.getQueryData<TaskDetails>(['tasks', 'detail', 'a'])?.status).toBe('todo')
  })

  it('invalidates lists and the detail after settling', async () => {
    vi.mocked(tasksApi.updateTask).mockResolvedValue(mk('a', 'done'))
    const { invalidate, wrapper } = setup()
    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    await act(() => result.current.mutateAsync({ id: 'a', patch: { status: 'done' } }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 'a'] })
  })

  it('does not touch the cache optimistically for non-status edits', async () => {
    let resolve: (t: Task) => void = () => {}
    vi.mocked(tasksApi.updateTask).mockImplementation(() => new Promise((r) => (resolve = r)))
    const { client, wrapper } = setup()
    client.setQueryData(listKey, page([mk('a')]))
    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    act(() => result.current.mutate({ id: 'a', patch: { title: 'Новое' } }))
    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(client.getQueryData<TaskPage>(listKey)?.items[0].title).toBe('Задача a')
    await act(async () => resolve(mk('a')))
  })

  it('on 404 removes the task from the caches and clears the selection', async () => {
    vi.mocked(tasksApi.updateTask).mockRejectedValue(new TaskNotFoundError('нет'))
    useTasksStore.setState({ selectedTaskId: 'a' })
    const { client, wrapper } = setup()
    client.setQueryData(listKey, page([mk('a'), mk('b')]))
    client.setQueryData(['tasks', 'detail', 'a'], details('a'))
    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: 'a', patch: { status: 'done' } })
      ).rejects.toBeInstanceOf(TaskNotFoundError)
    })
    expect(client.getQueryData<TaskPage>(listKey)?.items.map((t) => t.id)).toEqual(['b'])
    expect(client.getQueryData(['tasks', 'detail', 'a'])).toBeUndefined()
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
  })
})

describe('useDeleteTask', () => {
  it('removes the task, clears the selection and invalidates lists', async () => {
    vi.mocked(tasksApi.deleteTask).mockResolvedValue(undefined)
    useTasksStore.setState({ selectedTaskId: 'a' })
    const { client, invalidate, wrapper } = setup()
    client.setQueryData(['tasks', 'list', {}], page([mk('a'), mk('b')]))
    const { result } = renderHook(() => useDeleteTask(), { wrapper })
    await act(() => result.current.mutateAsync('a'))
    expect(client.getQueryData<TaskPage>(['tasks', 'list', {}])?.items.map((t) => t.id)).toEqual([
      'b'
    ])
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] })
  })

  it('treats 404 as success', async () => {
    vi.mocked(tasksApi.deleteTask).mockRejectedValue(new TaskNotFoundError('нет'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useDeleteTask(), { wrapper })
    await act(() => result.current.mutateAsync('a'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('keeps the selection when the server fails', async () => {
    vi.mocked(tasksApi.deleteTask).mockRejectedValue(new BackendError('сбой'))
    useTasksStore.setState({ selectedTaskId: 'a' })
    const { wrapper } = setup()
    const { result } = renderHook(() => useDeleteTask(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync('a')).rejects.toThrow('сбой')
    })
    expect(useTasksStore.getState().selectedTaskId).toBe('a')
  })
})

describe('attachment mutations', () => {
  it('upload invalidates the task details and the lists (attachment count)', async () => {
    const file = new File(['x'], 'a.txt')
    vi.mocked(tasksApi.uploadAttachment).mockResolvedValue({
      id: 'f1',
      taskId: 'a',
      originalName: 'a.txt',
      sizeBytes: 1,
      contentType: 'text/plain',
      uploadedBy: 'u1',
      createdAt: '2026-01-01T00:00:00Z'
    })
    const { invalidate, wrapper } = setup()
    const { result } = renderHook(() => useUploadAttachment(), { wrapper })
    const onProgress = vi.fn()
    await act(() => result.current.mutateAsync({ taskId: 'a', file, options: { onProgress } }))
    expect(tasksApi.uploadAttachment).toHaveBeenCalledWith('a', file, { onProgress })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 'a'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] })
  })

  it('delete invalidates the details, also on 404', async () => {
    vi.mocked(tasksApi.deleteAttachment).mockRejectedValue(new TaskNotFoundError('нет'))
    const { invalidate, wrapper } = setup()
    const { result } = renderHook(() => useDeleteAttachment(), { wrapper })
    await act(() => result.current.mutateAsync({ taskId: 'a', attachmentId: 'f1' }))
    expect(tasksApi.deleteAttachment).toHaveBeenCalledWith('a', 'f1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 'a'] })
  })
})

describe('useUsersSearch', () => {
  it('queries users only after the typing pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.mocked(usersApi.listUsers).mockResolvedValue({
        items: [{ id: 'u1', login: 'ann' }],
        total: 1,
        limit: 20,
        page: 1
      })
      const { wrapper } = setup()
      const { result, rerender } = renderHook(({ s }) => useUsersSearch(s), {
        wrapper,
        initialProps: { s: '' }
      })
      await waitFor(() => expect(usersApi.listUsers).toHaveBeenCalledTimes(1))
      rerender({ s: 'a' })
      rerender({ s: 'an' })
      act(() => void vi.advanceTimersByTime(200))
      expect(usersApi.listUsers).toHaveBeenCalledTimes(1)
      act(() => void vi.advanceTimersByTime(150))
      await waitFor(() => expect(usersApi.listUsers).toHaveBeenCalledTimes(2))
      expect(usersApi.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'an' }))
      await waitFor(() => expect(result.current.data?.items[0].login).toBe('ann'))
    } finally {
      vi.useRealTimers()
    }
  })
})

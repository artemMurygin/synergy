import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { BackendError, TaskNotFoundError, listTasks, updateTask } from '@/shared/tasks-api'
import type { ListTasksParams, Task, TaskDetails, TaskPage } from '@/shared/tasks-api'
import { useTasks } from './use-tasks'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  listTasks: vi.fn(),
  updateTask: vi.fn(),
}))

const ME = 'u1'

function task(id: string, deadline: string | null, status: Task['status'] = 'todo'): Task {
  return {
    id,
    title: `Задача ${id}`,
    description: '',
    status,
    deadline,
    creator: { id: ME, login: 'anna' },
    assignee: { id: ME, login: 'anna' },
    watchers: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
  }
}

function page(items: Task[], total = items.length, pageNo = 0): TaskPage {
  return { items, total, limit: 50, page: pageNo }
}

const T1 = task('t1', '2026-11-10T00:00:00.000Z')
const T2 = task('t2', '2026-11-12T00:00:00.000Z', 'in_progress')
const T3 = task('t3', null)

/** Serves `todo` and `in_progress` streams from the given pages (keyed by status and page number). */
function serve(pages: Record<string, TaskPage>) {
  vi.mocked(listTasks).mockImplementation((params: ListTasksParams) =>
    Promise.resolve(
      pages[`${String(params.status)}:${String(params.page)}`] ?? page([], 0, params.page),
    ),
  )
}

function details(source: Task): TaskDetails {
  return { ...source, attachments: [] }
}

beforeEach(() => {
  vi.mocked(listTasks).mockReset()
  vi.mocked(updateTask).mockReset()
  serve({ 'todo:0': page([T3, T1]), 'in_progress:0': page([T2]) })
})

async function ready() {
  const hook = renderHook(() => useTasks(ME, 20))
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false)
  })
  return hook
}

describe('useTasks', () => {
  it('loads both open streams for the user and merges them by deadline', async () => {
    const { result } = await ready()
    expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'todo', assigneeId: ME, sort: 'deadline', page: 0 }),
    )
    expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_progress', assigneeId: ME, page: 0 }),
    )
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(result.current.error).toBeNull()
    expect(result.current.hasMore).toBe(false)
  })

  it('reports a load failure and recovers on reload', async () => {
    vi.mocked(listTasks).mockRejectedValue(new BackendError('Сервер недоступен'))
    const { result } = await ready()
    expect(result.current.error).toBe('Сервер недоступен')
    expect(result.current.items).toEqual([])

    serve({ 'todo:0': page([T1]) })
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.items.map((t) => t.id)).toEqual(['t1'])
  })

  it('reload refreshes the items without dropping them meanwhile', async () => {
    const { result } = await ready()
    serve({
      'todo:0': page([T1, task('t4', '2026-11-11T00:00:00.000Z')]),
      'in_progress:0': page([]),
    })
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.reload()
    })
    expect(result.current.items).toHaveLength(3)
    await act(async () => {
      await pending
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't4'])
  })

  it('loadMore appends the next page of the streams that have more', async () => {
    serve({
      'todo:0': page([T1], 2),
      'todo:1': page([T3], 2, 1),
      'in_progress:0': page([T2], 1),
    })
    const { result } = await ready()
    expect(result.current.hasMore).toBe(true)
    expect(result.current.remaining).toBe(1)

    await act(async () => {
      await result.current.loadMore()
    })
    expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'todo', page: 1 }),
    )
    expect(vi.mocked(listTasks)).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_progress', page: 1 }),
    )
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(result.current.hasMore).toBe(false)
  })

  it('keeps the loaded items and shows an error when loadMore fails', async () => {
    serve({ 'todo:0': page([T1], 2), 'in_progress:0': page([]) })
    const { result } = await ready()
    vi.mocked(listTasks).mockRejectedValue(new BackendError('Сбой'))
    await act(async () => {
      await result.current.loadMore()
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t1'])
    expect(result.current.notice).toBe('Сбой')
    expect(result.current.hasMore).toBe(true)
  })

  it('changes the status optimistically and keeps it on success', async () => {
    let resolve: (value: TaskDetails) => void = () => undefined
    vi.mocked(updateTask).mockReturnValue(
      new Promise<TaskDetails>((r) => {
        resolve = r
      }),
    )
    const { result } = await ready()
    act(() => {
      void result.current.setStatus('t1', 'in_progress')
    })
    expect(result.current.items.find((t) => t.id === 't1')?.status).toBe('in_progress')
    expect(vi.mocked(updateTask)).toHaveBeenCalledWith('t1', { status: 'in_progress' })
    await act(async () => {
      resolve(details({ ...T1, status: 'in_progress' }))
      await Promise.resolve()
    })
    expect(result.current.items.find((t) => t.id === 't1')?.status).toBe('in_progress')
    expect(result.current.notice).toBeNull()
  })

  it('removes a closed task from the open list', async () => {
    vi.mocked(updateTask).mockResolvedValue(details({ ...T1, status: 'done' }))
    const { result } = await ready()
    await act(async () => {
      await result.current.setStatus('t1', 'done')
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t2', 't3'])
  })

  it('rolls the status back with a message when the server refuses', async () => {
    vi.mocked(updateTask).mockRejectedValue(new BackendError('Нельзя'))
    const { result } = await ready()
    await act(async () => {
      await result.current.setStatus('t1', 'done')
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(result.current.items.find((t) => t.id === 't1')?.status).toBe('todo')
    expect(result.current.notice).toBe('Не удалось изменить статус: Нельзя')
  })

  it('drops the task when the server says it no longer exists', async () => {
    vi.mocked(updateTask).mockRejectedValue(new TaskNotFoundError('нет'))
    const { result } = await ready()
    await act(async () => {
      await result.current.setStatus('t2', 'done')
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't3'])
    expect(result.current.notice).toBe('Задача не найдена: возможно, её удалили')
  })

  it('clears the notice on demand', async () => {
    vi.mocked(updateTask).mockRejectedValue(new BackendError('Нельзя'))
    const { result } = await ready()
    await act(async () => {
      await result.current.setStatus('t1', 'done')
    })
    act(() => {
      result.current.dismissNotice()
    })
    expect(result.current.notice).toBeNull()
  })

  describe('views and search', () => {
    it('starts on "mine" with an empty search', async () => {
      const { result } = await ready()
      expect(result.current.view).toBe('mine')
      expect(result.current.search).toBe('')
    })

    it('switching the view reloads with that view filter and drops the old items', async () => {
      const { result } = await ready()
      vi.mocked(listTasks).mockClear()
      vi.mocked(listTasks).mockImplementation(() => Promise.resolve(page([T2], 1)))
      act(() => {
        result.current.setView('watching')
      })
      expect(result.current.items).toEqual([])
      expect(result.current.loading).toBe(true)
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
      expect(vi.mocked(listTasks)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
        expect.objectContaining({ watcherId: ME, page: 0 }),
      )
      expect(result.current.view).toBe('watching')
      expect(result.current.items.map((t) => t.id)).toEqual(['t2'])
    })

    it('the "done" and "created" views use their own filters', async () => {
      const { result } = await ready()
      act(() => {
        result.current.setView('done')
      })
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'done', assigneeId: ME }),
        )
      })
      act(() => {
        result.current.setView('created')
      })
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
          expect.objectContaining({ creatorId: ME }),
        )
      })
    })

    it('searches by title after a pause, once, with the trimmed text', async () => {
      const { result } = await ready()
      vi.mocked(listTasks).mockClear()
      act(() => {
        result.current.setSearch('о')
      })
      act(() => {
        result.current.setSearch(' отчёт ')
      })
      expect(result.current.search).toBe(' отчёт ')
      expect(vi.mocked(listTasks)).not.toHaveBeenCalled()
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'todo', search: 'отчёт', page: 0 }),
        )
      })
      expect(vi.mocked(listTasks)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(listTasks)).not.toHaveBeenCalledWith(
        expect.objectContaining({ search: 'о' }),
      )
    })

    it('keeps the search when the view changes', async () => {
      const { result } = await ready()
      act(() => {
        result.current.setSearch('кп')
      })
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(expect.objectContaining({ search: 'кп' }))
      })
      vi.mocked(listTasks).mockClear()
      act(() => {
        result.current.setView('created')
      })
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
          expect.objectContaining({ creatorId: ME, search: 'кп' }),
        )
      })
    })

    it('ignores the answer of a view that was left before it arrived', async () => {
      let release: (value: TaskPage) => void = () => undefined
      const { result } = await ready()
      vi.mocked(listTasks).mockImplementationOnce(
        () =>
          new Promise<TaskPage>((resolve) => {
            release = resolve
          }),
      )
      act(() => {
        result.current.setView('watching')
      })
      vi.mocked(listTasks).mockImplementation(() => Promise.resolve(page([T3], 1)))
      act(() => {
        result.current.setView('created')
      })
      await waitFor(() => {
        expect(result.current.items.map((t) => t.id)).toEqual(['t3'])
      })
      await act(async () => {
        release(page([T1], 1))
        await Promise.resolve()
      })
      expect(result.current.items.map((t) => t.id)).toEqual(['t3'])
    })

    it('keeps a closed task in a non-"mine" view and updates its status', async () => {
      const { result } = await ready()
      vi.mocked(listTasks).mockImplementation(() => Promise.resolve(page([T1], 1)))
      act(() => {
        result.current.setView('created')
      })
      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })
      vi.mocked(updateTask).mockResolvedValue(details({ ...T1, status: 'done' }))
      await act(async () => {
        await result.current.setStatus('t1', 'done')
      })
      expect(result.current.items.map((t) => [t.id, t.status])).toEqual([['t1', 'done']])
    })
  })
})

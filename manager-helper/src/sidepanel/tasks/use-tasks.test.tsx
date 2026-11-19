import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { BackendError, TaskNotFoundError, listTasks, updateTask } from '@/shared/tasks-api'
import type { ListTasksParams, Task, TaskDetails, TaskPage } from '@/shared/tasks-api'
import { useOverdueCount, useTasks } from './use-tasks'

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
    attachmentCount: 0,
  }
}

function page(items: Task[], total = items.length, pageNo = 0): TaskPage {
  return { items, total, limit: 50, page: pageNo }
}

const T1 = task('t1', '2026-11-10T00:00:00.000Z')
const T2 = task('t2', '2026-11-12T00:00:00.000Z', 'in_progress')
const T3 = task('t3', null)

/** Serves the list from the given pages (keyed by page number). */
function serve(pages: Record<string, TaskPage>) {
  vi.mocked(listTasks).mockImplementation((params: ListTasksParams) =>
    Promise.resolve(pages[String(params.page)] ?? page([], 0, params.page)),
  )
}

function details(source: Task): TaskDetails {
  return { ...source, attachments: [] }
}

beforeEach(() => {
  vi.mocked(listTasks).mockReset()
  vi.mocked(updateTask).mockReset()
  serve({ '0': page([T1, T2, T3]) })
})

async function ready() {
  const hook = renderHook(() => useTasks(ME, 20))
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false)
  })
  return hook
}

describe('useTasks', () => {
  it('loads "Мои" of the user, the nearest deadline first, in one request', async () => {
    const { result } = await ready()
    expect(vi.mocked(listTasks)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: ME, sort: 'deadline', order: 'asc', page: 0 }),
    )
    expect(result.current.query).toEqual({
      view: 'mine',
      status: 'all',
      sort: 'deadline',
      search: '',
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(result.current.error).toBeNull()
    expect(result.current.hasMore).toBe(false)
  })

  it('reports a load failure and recovers on reload', async () => {
    vi.mocked(listTasks).mockRejectedValue(new BackendError('Сервер недоступен'))
    const { result } = await ready()
    expect(result.current.error).toBe('Сервер недоступен')
    expect(result.current.items).toEqual([])

    serve({ '0': page([T1]) })
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.items.map((t) => t.id)).toEqual(['t1'])
  })

  it('reload refreshes the items without dropping them meanwhile', async () => {
    const { result } = await ready()
    serve({ '0': page([T1, task('t4', '2026-11-11T00:00:00.000Z')]) })
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

  it('loadMore appends the next page', async () => {
    serve({ '0': page([T1], 2), '1': page([T3], 2, 1) })
    const { result } = await ready()
    expect(result.current.hasMore).toBe(true)
    expect(result.current.remaining).toBe(1)

    await act(async () => {
      await result.current.loadMore()
    })
    expect(vi.mocked(listTasks)).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't3'])
    expect(result.current.hasMore).toBe(false)
  })

  it('keeps the loaded items and shows an error when loadMore fails', async () => {
    serve({ '0': page([T1], 2) })
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
      void result.current.setTaskStatus('t1', 'in_progress')
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

  it('keeps a closed task in the list while the status filter is "all"', async () => {
    vi.mocked(updateTask).mockResolvedValue(details({ ...T1, status: 'done' }))
    const { result } = await ready()
    await act(async () => {
      await result.current.setTaskStatus('t1', 'done')
    })
    expect(result.current.items.map((t) => [t.id, t.status])).toEqual([
      ['t1', 'done'],
      ['t2', 'in_progress'],
      ['t3', 'todo'],
    ])
  })

  it('removes a task that no longer matches the status filter', async () => {
    vi.mocked(updateTask).mockResolvedValue(details({ ...T1, status: 'done' }))
    const { result } = await ready()
    act(() => {
      result.current.setStatusFilter('todo')
    })
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    await act(async () => {
      await result.current.setTaskStatus('t1', 'done')
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t2', 't3'])
  })

  it('rolls the status back with a message when the server refuses', async () => {
    vi.mocked(updateTask).mockRejectedValue(new BackendError('Нельзя'))
    const { result } = await ready()
    await act(async () => {
      await result.current.setTaskStatus('t1', 'done')
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(result.current.items.find((t) => t.id === 't1')?.status).toBe('todo')
    expect(result.current.notice).toBe('Не удалось изменить статус: Нельзя')
  })

  it('drops the task when the server says it no longer exists', async () => {
    vi.mocked(updateTask).mockRejectedValue(new TaskNotFoundError('нет'))
    const { result } = await ready()
    await act(async () => {
      await result.current.setTaskStatus('t2', 'done')
    })
    expect(result.current.items.map((t) => t.id)).toEqual(['t1', 't3'])
    expect(result.current.notice).toBe('Задача не найдена: возможно, её удалили')
  })

  it('clears the notice on demand', async () => {
    vi.mocked(updateTask).mockRejectedValue(new BackendError('Нельзя'))
    const { result } = await ready()
    await act(async () => {
      await result.current.setTaskStatus('t1', 'done')
    })
    act(() => {
      result.current.dismissNotice()
    })
    expect(result.current.notice).toBeNull()
  })

  describe('views, status, sort and search', () => {
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
      expect(result.current.query.view).toBe('watching')
      expect(result.current.items.map((t) => t.id)).toEqual(['t2'])
    })

    it('the "overdue" view and the status "done" send their own filters', async () => {
      const { result } = await ready()
      act(() => {
        result.current.setView('overdue')
      })
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
          expect.objectContaining({ overdue: true }),
        )
      })
      act(() => {
        result.current.setView('mine')
        result.current.setStatusFilter('done')
      })
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'done', assigneeId: ME }),
        )
      })
    })

    it('a new sort reloads the list', async () => {
      const { result } = await ready()
      act(() => {
        result.current.setSort('updated')
      })
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
          expect.objectContaining({ sort: 'updatedAt', order: 'desc' }),
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
      expect(result.current.query.search).toBe(' отчёт ')
      expect(vi.mocked(listTasks)).not.toHaveBeenCalled()
      await waitFor(() => {
        expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'отчёт', page: 0 }),
        )
      })
      expect(vi.mocked(listTasks)).toHaveBeenCalledTimes(1)
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
  })
})

describe('useOverdueCount', () => {
  it('reads the total of the overdue tasks with a one-item request', async () => {
    vi.mocked(listTasks).mockResolvedValue(page([T1], 3))
    const { result } = renderHook(() => useOverdueCount(0))
    await waitFor(() => {
      expect(result.current).toBe(3)
    })
    expect(vi.mocked(listTasks)).toHaveBeenCalledWith({ overdue: true, limit: 1 })
  })

  it('shows 0 when the request fails', async () => {
    vi.mocked(listTasks).mockRejectedValue(new BackendError('x'))
    const { result } = renderHook(() => useOverdueCount(0))
    await waitFor(() => {
      expect(vi.mocked(listTasks)).toHaveBeenCalled()
    })
    expect(result.current).toBe(0)
  })
})

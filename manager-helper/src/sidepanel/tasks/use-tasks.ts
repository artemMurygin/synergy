import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TaskSort, TaskStatusFilter, TaskView } from '@synergy/ui-kit'
import { TaskNotFoundError, listTasks, updateTask } from '@/shared/tasks-api'
import type { TaskStatus } from '@/shared/tasks-api'
import {
  DEFAULT_TASKS_QUERY,
  hasMore as streamHasMore,
  nextPage,
  remaining as streamRemaining,
  taskListFilter,
} from '@/shared/tasks-view'
import type { TaskStream, TasksQuery } from '@/shared/tasks-view'

function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'Неизвестная ошибка'
}

export const SEARCH_DEBOUNCE_MS = 300

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])
  return debounced
}

/** Total of the overdue tasks for the badge of the filters; `version` re-reads it after changes. */
export function useOverdueCount(version: number): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let current = true
    listTasks({ overdue: true, limit: 1 }).then(
      (page) => {
        if (current) setCount(page.total)
      },
      () => {
        if (current) setCount(0)
      },
    )
    return () => {
      current = false
    }
  }, [version])
  return count
}

/**
 * State of the tasks list: the view, the status filter, the sort and a title search that is sent
 * after a pause in typing. One server stream, paged on demand.
 */
export function useTasks(userId: string, debounceMs = SEARCH_DEBOUNCE_MS) {
  const [query, setQuery] = useState<TasksQuery>(DEFAULT_TASKS_QUERY)
  const debouncedSearch = useDebounced(query.search, debounceMs)
  const [stream, setStream] = useState<TaskStream | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const streamRef = useRef(stream)
  useEffect(() => {
    streamRef.current = stream
  }, [stream])
  /** Only the latest load may write its result. */
  const loadId = useRef(0)
  const { view, status, sort } = query

  const load = useCallback(async () => {
    const id = ++loadId.current
    setError(null)
    try {
      const filter = taskListFilter({ view, status, sort, search: debouncedSearch }, userId)
      const result = await listTasks({ ...filter, page: 0 })
      if (id !== loadId.current) return
      setStream({ filter, items: result.items, total: result.total, page: 0 })
    } catch (failure) {
      if (id !== loadId.current) return
      setError(messageOf(failure))
    } finally {
      if (id === loadId.current) setLoading(false)
    }
  }, [userId, view, status, sort, debouncedSearch])

  useEffect(() => {
    Promise.resolve().then(load, load)
  }, [load])

  /** A changed view, status or sort: the old rows must not flash under the new list. */
  const change = useCallback((patch: Partial<TasksQuery>) => {
    loadId.current += 1
    setQuery((current) => ({ ...current, ...patch }))
    setStream(null)
    setError(null)
    setLoading(true)
  }, [])
  const setView = useCallback((next: TaskView) => { change({ view: next }) }, [change])
  const setStatusFilter = useCallback(
    (next: TaskStatusFilter) => { change({ status: next }) },
    [change],
  )
  const setSort = useCallback((next: TaskSort) => { change({ sort: next }) }, [change])
  const setSearch = useCallback((next: string) => {
    setQuery((current) => ({ ...current, search: next }))
  }, [])

  const loadMore = useCallback(async () => {
    const current = streamRef.current
    if (current === null || !streamHasMore(current)) return
    const id = loadId.current
    setLoadingMore(true)
    try {
      const fetched = await listTasks(nextPage(current))
      if (id !== loadId.current) return
      setStream((now) => {
        if (now === null) return now
        const known = new Set(now.items.map((t) => t.id))
        return {
          ...now,
          items: [...now.items, ...fetched.items.filter((t) => !known.has(t.id))],
          total: fetched.total,
          page: now.page + 1,
        }
      })
    } catch (failure) {
      setNotice(messageOf(failure))
    } finally {
      setLoadingMore(false)
    }
  }, [])

  const removeTask = useCallback((taskId: string) => {
    setStream((current) =>
      current === null || !current.items.some((t) => t.id === taskId)
        ? current
        : {
            ...current,
            items: current.items.filter((t) => t.id !== taskId),
            total: Math.max(0, current.total - 1),
          },
    )
  }, [])

  const setTaskStatus = useCallback(
    async (taskId: string, next: TaskStatus) => {
      const before = streamRef.current
      const origin = before?.items.find((t) => t.id === taskId)
      if (before === null || origin === undefined) return
      // A status filter other than "all" lets the task leave the list; elsewhere it stays visible.
      const leavesList = status !== 'all' && status !== next
      setStream({
        ...before,
        items: leavesList
          ? before.items.filter((t) => t.id !== taskId)
          : before.items.map((t) => (t.id === taskId ? { ...t, status: next } : t)),
        total: leavesList ? Math.max(0, before.total - 1) : before.total,
      })
      try {
        await updateTask(taskId, { status: next })
      } catch (failure) {
        if (failure instanceof TaskNotFoundError) {
          removeTask(taskId)
          setNotice('Задача не найдена: возможно, её удалили')
          return
        }
        setStream((now) => {
          if (now === null || now.filter !== before.filter) return now
          if (now.items.some((t) => t.id === taskId)) {
            return { ...now, items: now.items.map((t) => (t.id === taskId ? origin : t)) }
          }
          const items = [...now.items]
          items.splice(Math.min(before.items.indexOf(origin), items.length), 0, origin)
          return { ...now, items, total: now.total + 1 }
        })
        setNotice(`Не удалось изменить статус: ${messageOf(failure)}`)
      }
    },
    [removeTask, status],
  )

  const items = useMemo(() => stream?.items ?? [], [stream])
  const remaining = stream === null ? 0 : streamRemaining(stream)

  return {
    query,
    setView,
    setStatusFilter,
    setSort,
    setSearch,
    items,
    loading,
    loadingMore,
    error,
    notice,
    hasMore: remaining > 0,
    remaining,
    total: stream?.total ?? 0,
    reload: load,
    loadMore,
    setTaskStatus,
    dismissNotice: useCallback(() => {
      setNotice(null)
    }, []),
  }
}

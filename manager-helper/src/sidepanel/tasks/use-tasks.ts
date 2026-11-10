import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TaskNotFoundError, listTasks, updateTask } from '@/shared/tasks-api'
import type { TaskStatus } from '@/shared/tasks-api'
import {
  hasMore as streamHasMore,
  mergeStreams,
  nextPage,
  remaining as streamRemaining,
  viewStreamFilters,
} from '@/shared/tasks-view'
import type { TaskStream, TasksView } from '@/shared/tasks-view'

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

/**
 * State of the tasks list: the selected view (one or two server streams, merged by deadline)
 * and a title search that is sent after a pause in typing.
 */
export function useTasks(userId: string, debounceMs = SEARCH_DEBOUNCE_MS) {
  const [view, setViewState] = useState<TasksView>('mine')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, debounceMs)
  const [streams, setStreams] = useState<TaskStream[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const streamsRef = useRef(streams)
  useEffect(() => {
    streamsRef.current = streams
  }, [streams])
  /** Only the latest load may write its result. */
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    setError(null)
    try {
      const filters = viewStreamFilters(view, userId, debouncedSearch)
      const pages = await Promise.all(filters.map((filter) => listTasks({ ...filter, page: 0 })))
      if (id !== loadId.current) return
      setStreams(
        filters.map((filter, index) => ({
          filter,
          items: pages[index]?.items ?? [],
          total: pages[index]?.total ?? 0,
          page: 0,
        })),
      )
    } catch (failure) {
      if (id !== loadId.current) return
      setError(messageOf(failure))
    } finally {
      if (id === loadId.current) setLoading(false)
    }
  }, [userId, view, debouncedSearch])

  useEffect(() => {
    Promise.resolve().then(load, load)
  }, [load])

  const setView = useCallback((next: TasksView) => {
    // The old view's rows must not flash under the new one.
    loadId.current += 1
    setViewState(next)
    setStreams([])
    setError(null)
    setLoading(true)
  }, [])

  const loadMore = useCallback(async () => {
    const pending = streamsRef.current.filter(streamHasMore)
    if (pending.length === 0) return
    const id = loadId.current
    setLoadingMore(true)
    try {
      const pages = await Promise.all(pending.map((stream) => listTasks(nextPage(stream))))
      if (id !== loadId.current) return
      setStreams((current) =>
        current.map((stream) => {
          const index = pending.findIndex((p) => p.filter === stream.filter)
          const fetched = pages[index]
          if (fetched === undefined) return stream
          const known = new Set(stream.items.map((t) => t.id))
          return {
            ...stream,
            items: [...stream.items, ...fetched.items.filter((t) => !known.has(t.id))],
            total: fetched.total,
            page: stream.page + 1,
          }
        }),
      )
    } catch (failure) {
      setNotice(messageOf(failure))
    } finally {
      setLoadingMore(false)
    }
  }, [])

  const removeTask = useCallback((taskId: string) => {
    setStreams((current) =>
      current.map((stream) =>
        stream.items.some((t) => t.id === taskId)
          ? {
              ...stream,
              items: stream.items.filter((t) => t.id !== taskId),
              total: Math.max(0, stream.total - 1),
            }
          : stream,
      ),
    )
  }, [])

  const setStatus = useCallback(
    async (taskId: string, status: TaskStatus) => {
      const owner = streamsRef.current.find((s) => s.items.some((t) => t.id === taskId))
      const origin = owner?.items.find((t) => t.id === taskId)
      if (owner === undefined || origin === undefined) return
      const ownerFilter = owner.filter
      // Only "mine" is an open-tasks list; elsewhere a closed task stays visible.
      const leavesList = status === 'done' && view === 'mine'
      const originIndex = owner.items.indexOf(origin)
      // Optimistic: a closed task leaves the open list, the others change in place.
      setStreams((current) =>
        current.map((stream) => {
          if (!stream.items.some((t) => t.id === taskId)) return stream
          if (leavesList) {
            return {
              ...stream,
              items: stream.items.filter((t) => t.id !== taskId),
              total: Math.max(0, stream.total - 1),
            }
          }
          return {
            ...stream,
            items: stream.items.map((t) => (t.id === taskId ? { ...t, status } : t)),
          }
        }),
      )
      try {
        await updateTask(taskId, { status })
      } catch (failure) {
        if (failure instanceof TaskNotFoundError) {
          removeTask(taskId)
          setNotice('Задача не найдена: возможно, её удалили')
          return
        }
        setStreams((current) =>
          current.map((stream) => {
            if (stream.filter !== ownerFilter) return stream
            const present = stream.items.some((t) => t.id === taskId)
            if (present) {
              return { ...stream, items: stream.items.map((t) => (t.id === taskId ? origin : t)) }
            }
            const items = [...stream.items]
            items.splice(Math.min(originIndex, items.length), 0, origin)
            return { ...stream, items, total: stream.total + 1 }
          }),
        )
        setNotice(`Не удалось изменить статус: ${messageOf(failure)}`)
      }
    },
    [removeTask, view],
  )

  const items = useMemo(() => mergeStreams(streams), [streams])
  const remaining = useMemo(
    () => streams.reduce((sum, stream) => sum + streamRemaining(stream), 0),
    [streams],
  )

  return {
    view,
    setView,
    search,
    setSearch,
    items,
    loading,
    loadingMore,
    error,
    notice,
    hasMore: remaining > 0,
    remaining,
    reload: load,
    loadMore,
    setStatus,
    dismissNotice: useCallback(() => {
      setNotice(null)
    }, []),
  }
}

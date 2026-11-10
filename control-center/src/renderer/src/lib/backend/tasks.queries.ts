import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query'
import { useEffect } from 'react'
import { useDebouncedValue } from '../use-debounced-value'
import { TaskNotFoundError } from './errors'
import * as tasksApi from './tasks.api'
import type { TaskFilters, UpdateTaskInput, UploadOptions } from './tasks.api'
import type { Task, TaskDetails, TaskPage } from './tasks.schema'
import { listUsers } from './users.api'
import { useTasksStore } from '@/stores/tasks.store'

const LISTS_KEY = ['tasks', 'list'] as const
const detailKey = (id: string) => ['tasks', 'detail', id] as const

export const USER_SEARCH_DELAY_MS = 300
export const USER_SEARCH_LIMIT = 20

export const tasksQuery = (filters: TaskFilters) =>
  queryOptions({
    queryKey: [...LISTS_KEY, filters],
    queryFn: () => tasksApi.listTasks(filters),
    // the list stays on screen while the next page or filter loads
    placeholderData: keepPreviousData
  })

export const taskQuery = (id: string) =>
  queryOptions({
    queryKey: detailKey(id),
    queryFn: () => tasksApi.getTask(id)
  })

export const usersQuery = (search: string) =>
  queryOptions({
    queryKey: ['users', search],
    queryFn: () => listUsers({ search, limit: USER_SEARCH_LIMIT })
  })

/** User search that waits for a pause in typing. */
export function useUsersSearch(search: string) {
  return useQuery(usersQuery(useDebouncedValue(search, USER_SEARCH_DELAY_MS)))
}

/** Task details; a 404 drops the task from every cache. */
export function useTask(id: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery({ ...taskQuery(id ?? ''), enabled: id !== null })
  const notFound = query.error instanceof TaskNotFoundError
  useEffect(() => {
    if (id !== null && notFound) forgetTask(queryClient, id)
  }, [queryClient, id, notFound])
  return query
}

function forgetTask(queryClient: QueryClient, id: string): void {
  queryClient.setQueriesData<TaskPage>({ queryKey: LISTS_KEY }, (page) =>
    page ? { ...page, items: page.items.filter((task) => task.id !== id) } : page
  )
  queryClient.removeQueries({ queryKey: detailKey(id) })
  const store = useTasksStore.getState()
  if (store.selectedTaskId === id) store.selectTask(null)
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: tasksApi.CreateTaskInput) => tasksApi.createTask(input),
    onSuccess: async (task) => {
      useTasksStore.getState().selectTask(task.id)
      await queryClient.invalidateQueries({ queryKey: LISTS_KEY })
    }
  })
}

interface UpdateVars {
  id: string
  patch: UpdateTaskInput
}

interface Snapshot {
  lists: [readonly unknown[], TaskPage | undefined][]
  detail: TaskDetails | undefined
}

const withStatus = <T extends Task>(task: T, id: string, status: Task['status']): T =>
  task.id === id ? { ...task, status } : task

/** Only the status is applied optimistically; other edits wait for the server. */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation<Task, Error, UpdateVars, Snapshot | undefined>({
    mutationFn: ({ id, patch }) => tasksApi.updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      const status = patch.status
      if (status === undefined) return undefined
      await queryClient.cancelQueries({ queryKey: LISTS_KEY })
      await queryClient.cancelQueries({ queryKey: detailKey(id) })
      const snapshot: Snapshot = {
        lists: queryClient.getQueriesData<TaskPage>({ queryKey: LISTS_KEY }),
        detail: queryClient.getQueryData<TaskDetails>(detailKey(id))
      }
      queryClient.setQueriesData<TaskPage>({ queryKey: LISTS_KEY }, (page) =>
        page ? { ...page, items: page.items.map((task) => withStatus(task, id, status)) } : page
      )
      queryClient.setQueryData<TaskDetails>(detailKey(id), (task) =>
        task ? withStatus(task, id, status) : task
      )
      return snapshot
    },
    onError: (error, { id }, snapshot) => {
      if (error instanceof TaskNotFoundError) {
        forgetTask(queryClient, id)
        return
      }
      if (!snapshot) return
      for (const [key, data] of snapshot.lists) queryClient.setQueryData(key, data)
      if (snapshot.detail) queryClient.setQueryData(detailKey(id), snapshot.detail)
    },
    onSettled: async (_data, error, { id }) => {
      if (error instanceof TaskNotFoundError) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: LISTS_KEY }),
        queryClient.invalidateQueries({ queryKey: detailKey(id) })
      ])
    }
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await tasksApi.deleteTask(id)
      } catch (error) {
        // 404: the task is already gone, which is the desired outcome
        if (!(error instanceof TaskNotFoundError)) throw error
      }
    },
    onSuccess: async (_data, id) => {
      forgetTask(queryClient, id)
      await queryClient.invalidateQueries({ queryKey: LISTS_KEY })
    }
  })
}

export function useUploadAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, file, options }: { taskId: string; file: File; options?: UploadOptions }) =>
      tasksApi.uploadAttachment(taskId, file, options),
    onSuccess: async (_data, { taskId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey(taskId) }),
        queryClient.invalidateQueries({ queryKey: LISTS_KEY })
      ])
    }
  })
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, attachmentId }: { taskId: string; attachmentId: string }) => {
      try {
        await tasksApi.deleteAttachment(taskId, attachmentId)
      } catch (error) {
        // 404: already removed; refreshing the details drops it from the list
        if (!(error instanceof TaskNotFoundError)) throw error
      }
    },
    onSuccess: async (_data, { taskId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey(taskId) }),
        queryClient.invalidateQueries({ queryKey: LISTS_KEY })
      ])
    }
  })
}

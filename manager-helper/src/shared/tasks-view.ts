import type { ListTasksParams, Task } from './tasks-api'

/** The backend cannot filter "not done", so "my open tasks" are two independent streams. */
export const OPEN_STATUSES = ['todo', 'in_progress'] as const
export type OpenStatus = (typeof OPEN_STATUSES)[number]

export const DEFAULT_PAGE_LIMIT = 50

export type TasksView = 'mine' | 'watching' | 'created' | 'done'

export const TASKS_VIEWS: readonly { id: TasksView; label: string }[] = [
  { id: 'mine', label: 'Мои' },
  { id: 'watching', label: 'Наблюдаю' },
  { id: 'created', label: 'Созданные мной' },
  { id: 'done', label: 'Готовые' },
]

export interface TaskStream {
  /** Request without `page`: the stream is defined by it. */
  filter: Omit<ListTasksParams, 'page'>
  items: Task[]
  total: number
  /** Zero-based number of the last loaded page. */
  page: number
}

function openStreamFilter(status: OpenStatus, assigneeId: string, limit: number) {
  return { status, assigneeId, sort: 'deadline', order: 'asc', limit } satisfies Omit<
    ListTasksParams,
    'page'
  >
}

/** Stream definitions of a view (without `page`); a blank search is dropped. */
export function viewStreamFilters(
  view: TasksView,
  userId: string,
  search: string,
  limit = DEFAULT_PAGE_LIMIT,
): TaskStream['filter'][] {
  const base = { sort: 'updatedAt', order: 'desc', limit } as const
  const filters: TaskStream['filter'][] =
    view === 'mine'
      ? OPEN_STATUSES.map((status) => openStreamFilter(status, userId, limit))
      : view === 'watching'
        ? [{ watcherId: userId, ...base }]
        : view === 'created'
          ? [{ creatorId: userId, ...base }]
          : [{ status: 'done', assigneeId: userId, ...base }]
  const term = search.trim()
  return term === '' ? filters : filters.map((filter) => ({ ...filter, search: term }))
}

/** First-page requests of a view. */
export function viewFilters(
  view: TasksView,
  userId: string,
  search: string,
  limit = DEFAULT_PAGE_LIMIT,
): ListTasksParams[] {
  return viewStreamFilters(view, userId, search, limit).map((filter) => ({ ...filter, page: 0 }))
}

/** First-page requests of "my open tasks": one per open status. */
export function openTasksFilters(
  assigneeId: string,
  limit = DEFAULT_PAGE_LIMIT,
): ListTasksParams[] {
  return viewFilters('mine', assigneeId, '', limit)
}

export function remaining(stream: TaskStream): number {
  return Math.max(0, stream.total - stream.items.length)
}

export function hasMore(stream: TaskStream): boolean {
  return remaining(stream) > 0
}

/** Request for the page after the last loaded one of the stream. */
export function nextPage(stream: TaskStream): ListTasksParams {
  return { ...stream.filter, page: stream.page + 1 }
}

function deadlineTime(task: Task): number {
  return task.deadline === null ? Number.POSITIVE_INFINITY : Date.parse(task.deadline)
}

/** Merge several streams by deadline, nearest first, no deadline last; ties keep stream order. */
export function mergeStreams(streams: readonly TaskStream[]): Task[] {
  // A lone stream is already ordered by the server.
  if (streams.length === 1) return [...(streams[0]?.items ?? [])]
  return streams
    .flatMap((stream) => stream.items)
    .map((task, index) => ({ task, index, time: deadlineTime(task) }))
    .sort((a, b) => {
      if (a.time === b.time) return a.index - b.index
      return a.time < b.time ? -1 : 1
    })
    .map(({ task }) => task)
}

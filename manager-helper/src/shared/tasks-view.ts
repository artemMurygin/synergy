import type { TaskSort, TaskStatusFilter, TaskView } from '@synergy/ui-kit'
import type { ListTasksParams, Task } from './tasks-api'

export const DEFAULT_PAGE_LIMIT = 50

/** What the filters of the package show: the view, the status, the sort and the title search. */
export interface TasksQuery {
  view: TaskView
  status: TaskStatusFilter
  sort: TaskSort
  search: string
}

/** "Мои", all statuses, the nearest deadline first. */
export const DEFAULT_TASKS_QUERY: TasksQuery = {
  view: 'mine',
  status: 'all',
  sort: 'deadline',
  search: '',
}

export interface TaskStream {
  /** Request without `page`: the stream is defined by it. */
  filter: Omit<ListTasksParams, 'page'>
  items: Task[]
  total: number
  /** Zero-based number of the last loaded page. */
  page: number
}

// The package names the sorts "updated" / "created"; the backend "updatedAt" / "createdAt".
const SORTS = {
  deadline: { sort: 'deadline', order: 'asc' },
  updated: { sort: 'updatedAt', order: 'desc' },
  created: { sort: 'createdAt', order: 'desc' },
} as const

function viewFilter(view: TaskView, userId: string): Omit<ListTasksParams, 'page'> {
  switch (view) {
    case 'all':
      return {}
    case 'mine':
      return { assigneeId: userId }
    case 'watching':
      return { watcherId: userId }
    case 'created':
      return { creatorId: userId }
    case 'overdue':
      return { overdue: true }
  }
}

/** Request (without `page`) of the list for the chosen view, status, sort and search. */
export function taskListFilter(
  query: TasksQuery,
  userId: string,
  limit = DEFAULT_PAGE_LIMIT,
): TaskStream['filter'] {
  const term = query.search.trim()
  return {
    ...viewFilter(query.view, userId),
    ...(query.status === 'all' ? {} : { status: query.status }),
    ...(term === '' ? {} : { search: term }),
    ...SORTS[query.sort],
    limit,
  }
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

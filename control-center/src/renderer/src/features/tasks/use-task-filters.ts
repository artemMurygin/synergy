import { useSessionStore } from '@/features/auth/session.store'
import type { TaskFilters } from '@/lib/backend/tasks.api'
import { useTasksStore } from '@/stores/tasks.store'
import { viewToFilter } from './view-filter'

export const PAGE_SIZE = 20

/** Filters of the current task list, built from the tasks store; shared so every caller hits the same query. */
export function useTaskFilters(): TaskFilters {
  const userId = useSessionStore((s) => s.snapshot.user?.id ?? '')
  const view = useTasksStore((s) => s.view)
  const status = useTasksStore((s) => s.status)
  const search = useTasksStore((s) => s.search)
  const sort = useTasksStore((s) => s.sort)
  const order = useTasksStore((s) => s.order)
  const page = useTasksStore((s) => s.page)

  const trimmed = search.trim()
  return {
    ...viewToFilter(view, userId),
    ...(status ? { status } : {}),
    ...(trimmed ? { search: trimmed } : {}),
    sort,
    order,
    limit: PAGE_SIZE,
    page
  }
}

/** "1 задача", "2 задачи", "5 задач". */
export function pluralTasks(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} задача`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} задачи`
  return `${n} задач`
}

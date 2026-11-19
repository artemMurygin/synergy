import { TaskFilters, type TaskSort as UiSort, type TaskStatusFilter } from '@synergy/ui-kit'
import { useQuery } from '@tanstack/react-query'
import { tasksQuery } from '@/lib/backend/tasks.queries'
import { useTasksStore, type TaskOrder, type TaskSort } from '@/stores/tasks.store'

// The package names the sorts "updated" / "created"; the backend and the store "updatedAt" / "createdAt"
const TO_STORE: Record<UiSort, { sort: TaskSort; order: TaskOrder }> = {
  deadline: { sort: 'deadline', order: 'asc' },
  updated: { sort: 'updatedAt', order: 'desc' },
  created: { sort: 'createdAt', order: 'desc' }
}

const FROM_STORE: Record<TaskSort, UiSort> = {
  deadline: 'deadline',
  updatedAt: 'updated',
  createdAt: 'created'
}

/** Views, status, sort and search of the package, bound to the tasks store. */
export function TaskFiltersContainer() {
  const view = useTasksStore((s) => s.view)
  const status = useTasksStore((s) => s.status)
  const sort = useTasksStore((s) => s.sort)
  const search = useTasksStore((s) => s.search)
  const setView = useTasksStore((s) => s.setView)
  const setStatus = useTasksStore((s) => s.setStatus)
  const setSort = useTasksStore((s) => s.setSort)
  const setOrder = useTasksStore((s) => s.setOrder)
  const setSearch = useTasksStore((s) => s.setSearch)
  // only the total matters, so ask for a single item
  const overdueCount = useQuery(tasksQuery({ overdue: true, limit: 1 })).data?.total ?? 0

  return (
    <TaskFilters
      view={view}
      onViewChange={setView}
      status={status ?? 'all'}
      onStatusChange={(next: TaskStatusFilter) => {
        setStatus(next === 'all' ? null : next)
      }}
      sort={FROM_STORE[sort]}
      onSortChange={(next) => {
        setSort(TO_STORE[next].sort)
        setOrder(TO_STORE[next].order)
      }}
      overdueCount={overdueCount}
      search={search}
      onSearch={setSearch}
    />
  )
}

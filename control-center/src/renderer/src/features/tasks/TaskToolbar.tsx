import { useQuery } from '@tanstack/react-query'
import { ArrowUpDown, ChevronDown, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/utils'
import { tasksQuery } from '@/lib/backend/tasks.queries'
import { TASK_STATUSES, type TaskStatus } from '@/lib/backend/tasks.schema'
import { useTasksStore, type TaskOrder, type TaskSort } from '@/stores/tasks.store'
import { TASK_VIEWS, type TaskView } from './view-filter'
import { STATUS_META } from './status'

export const SEARCH_DELAY_MS = 300

const VIEW_LABELS: Record<TaskView, string> = {
  all: 'Все',
  mine: 'Мои',
  watching: 'Я наблюдаю',
  created: 'Созданные мной',
  overdue: 'Просрочено'
}

const SORT_OPTIONS: { value: `${TaskSort}:${TaskOrder}`; label: string }[] = [
  { value: 'createdAt:desc', label: 'Сначала новые' },
  { value: 'deadline:asc', label: 'По дедлайну' },
  { value: 'updatedAt:desc', label: 'Недавно изменённые' }
]

// Field look from the mock: h 40, radius 12, border-strong, 15px text.
const fieldClass =
  'h-10 w-full rounded-md border border-border-strong bg-background text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring'
const selectClass = cn(fieldClass, 'cursor-pointer appearance-none pr-10')
const fieldIconClass = 'pointer-events-none absolute top-1/2 size-[18px] -translate-y-1/2'

export function TaskToolbar() {
  const view = useTasksStore((s) => s.view)
  const status = useTasksStore((s) => s.status)
  const sort = useTasksStore((s) => s.sort)
  const order = useTasksStore((s) => s.order)
  const storedSearch = useTasksStore((s) => s.search)
  const setView = useTasksStore((s) => s.setView)
  const setStatus = useTasksStore((s) => s.setStatus)
  const setSort = useTasksStore((s) => s.setSort)
  const setOrder = useTasksStore((s) => s.setOrder)
  const setSearch = useTasksStore((s) => s.setSearch)
  // only the total matters, so ask for a single item
  const overdueCount = useQuery(tasksQuery({ overdue: true, limit: 1 })).data?.total ?? 0

  // The input is local so typing is instant; the store (and the request) follows after a pause.
  const [text, setText] = useState(storedSearch)
  const debounced = useDebouncedValue(text, SEARCH_DELAY_MS)
  const [seenStored, setSeenStored] = useState(storedSearch)
  if (storedSearch !== seenStored) {
    // changed elsewhere (e.g. "Сбросить фильтры")
    setSeenStored(storedSearch)
    if (storedSearch !== text) setText(storedSearch)
  }
  useEffect(() => {
    if (debounced !== useTasksStore.getState().search) setSearch(debounced)
  }, [debounced, setSearch])

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Представление" className="flex flex-wrap gap-2">
        {TASK_VIEWS.map((id) => {
          const active = view === id
          const overdue = id === 'overdue'
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setView(id)}
              className={cn(
                'h-9 rounded-full border px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-brand-red bg-brand-red-soft text-brand-red'
                  : cn('border-border-strong bg-background hover:bg-surface-alt', overdue ? 'text-brand-red' : 'text-ink')
              )}
            >
              {VIEW_LABELS[id]}
              {overdue && overdueCount > 0 && <span className="text-xs">{` · ${overdueCount}`}</span>}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className={cn(fieldIconClass, 'left-4 text-ink-40')} />
          <Input
            type="search"
            aria-label="Поиск по названию"
            placeholder="Поиск по названию"
            className={cn(fieldClass, 'py-0 pr-4 pl-11 placeholder:text-ink-40')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="relative w-[170px] shrink-0">
          <select
            aria-label="Статус"
            className={cn(selectClass, 'pl-4')}
            value={status ?? ''}
            onChange={(e) => setStatus(e.target.value === '' ? null : (e.target.value as TaskStatus))}
          >
            <option value="">Все статусы</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className={cn(fieldIconClass, 'right-4 text-ink-60')} />
        </div>
        <div className="relative w-[230px] shrink-0">
          <ArrowUpDown aria-hidden className={cn(fieldIconClass, 'left-4 text-ink-40')} />
          <select
            aria-label="Сортировка"
            className={cn(selectClass, 'pl-11')}
            value={`${sort}:${order}`}
            onChange={(e) => {
              const [nextSort, nextOrder] = e.target.value.split(':') as [TaskSort, TaskOrder]
              setSort(nextSort)
              setOrder(nextOrder)
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className={cn(fieldIconClass, 'right-4 text-ink-60')} />
        </div>
      </div>
    </div>
  )
}

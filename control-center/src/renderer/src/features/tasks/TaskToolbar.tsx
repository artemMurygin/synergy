import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/utils'
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
  overdue: 'Просроченные'
}

const SORT_OPTIONS: { value: `${TaskSort}:${TaskOrder}`; label: string }[] = [
  { value: 'createdAt:desc', label: 'Сначала новые' },
  { value: 'deadline:asc', label: 'По дедлайну' },
  { value: 'updatedAt:desc', label: 'Недавно изменённые' }
]

const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

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
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Представление" className="flex flex-wrap gap-2">
        {TASK_VIEWS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={cn(
              'h-8 rounded-full border px-3.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
              view === id
                ? 'border-brand-red bg-brand-red-soft text-brand-red'
                : 'bg-background text-ink-60 hover:bg-surface-alt'
            )}
          >
            {VIEW_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <select
        aria-label="Статус"
        className={selectClass}
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
      <select
        aria-label="Сортировка"
        className={selectClass}
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
      <div className="relative w-56">
        <Search aria-hidden className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-60" />
        <Input
          type="search"
          aria-label="Поиск по названию"
          placeholder="Поиск по названию"
          className="pl-9"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </div>
  )
}

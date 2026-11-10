import { TASKS_VIEWS } from '@/shared/tasks-view'
import type { TasksView } from '@/shared/tasks-view'

interface Props {
  view: TasksView
  search: string
  onViewChange: (view: TasksView) => void
  onSearchChange: (search: string) => void
}

/** Views of the tasks list ("Мои", "Наблюдаю", ...) and a search by title. */
export function TasksToolbar({ view, search, onViewChange, onSearchChange }: Props) {
  return (
    <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
      <div role="tablist" aria-label="Представление" className="flex gap-1 overflow-x-auto">
        {TASKS_VIEWS.map(({ id, label }) => {
          const active = id === view
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                active
                  ? 'bg-ink text-white'
                  : 'border border-line bg-surface-alt text-ink-60 hover:text-ink'
              }`}
              onClick={() => {
                if (!active) onViewChange(id)
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
      <input
        type="search"
        aria-label="Поиск по названию"
        placeholder="Поиск по названию"
        value={search}
        className="w-full min-w-0 rounded-lg border border-line bg-surface-alt px-3 py-1.5 text-sm text-ink placeholder:text-ink-40"
        onChange={(event) => {
          onSearchChange(event.target.value)
        }}
      />
    </div>
  )
}

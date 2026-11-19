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
    <div className="flex flex-col gap-2 px-4 pt-3 pb-1 max-[359px]:px-2">
      {/* Четыре фильтра умещаются в одну строку и на 320 px (там отступы плотнее, как в макете
          «Узкая панель»); если не хватит места, строка прокручивается без видимой полосы. */}
      <div
        role="tablist"
        aria-label="Представление"
        className="flex gap-1.5 overflow-x-auto max-[359px]:gap-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TASKS_VIEWS.map(({ id, label }) => {
          const active = id === view
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`h-7.5 shrink-0 rounded-full border px-3 text-[13px] font-medium max-[359px]:px-2 ${
                active
                  ? 'border-brand-red bg-brand-red-soft text-brand-red'
                  : 'border-field-line bg-surface text-ink hover:bg-surface-alt'
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
        className="h-9 w-full min-w-0 rounded-xl border border-field-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-40 focus:border-brand-red"
        onChange={(event) => {
          onSearchChange(event.target.value)
        }}
      />
    </div>
  )
}

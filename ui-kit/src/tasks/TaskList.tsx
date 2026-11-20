import type { ReactNode } from 'react'
import { ChevronsDown, ListChecks, Plus, WifiOff } from '../icons'
import { useOptionalLayoutMode } from '../layout/layout-mode'
import { cn } from '../lib/cn'
import { Button } from '../primitives/Button'
import { Skeleton } from '../primitives/Skeleton'
import { groupByDeadline } from './deadline'
import { TaskRow } from './TaskRow'
import { TaskSearchEmpty } from './TaskSearchEmpty'
import type { TaskView } from './task-views'
import type { TaskItem, TaskSort, TaskStatus } from './types'

export type TaskListProps = {
  items: TaskItem[]
  /** Первичная загрузка: данных ещё нет. */
  loading: boolean
  /** Обновление при уже показанных данных: список остаётся на экране. */
  refreshing?: boolean
  loadingMore?: boolean
  error: string | null
  hasMore: boolean
  remaining: number
  selectedId: string | null
  now?: Date
  view?: TaskView
  /** Активен поиск по названию. */
  searching?: boolean
  variant?: 'wide' | 'compact'
  /** Текущая сортировка: группы по сроку показываются только при `deadline` в tablet / mobile. */
  sort?: TaskSort
  /** Сброс поиска и фильтров на экране «Ничего не найдено». */
  onResetFilters?: () => void
  onOpen: (taskId: string) => void
  onSetStatus?: (taskId: string, status: TaskStatus) => void
  onLoadMore: () => void
  onRetry: () => void
  onCreate?: () => void
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Загрузка задач" className="flex flex-col gap-2 p-2">
      {[72, 55, 80, 60, 70].map((width, index) => (
        <div key={index} className="flex h-[72px] items-center gap-3.5 px-3.5">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3" style={{ width: `${String(width)}%` }} />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Notice(props: { icon: ReactNode; title: string; text: string; tone?: 'error'; children?: ReactNode }) {
  return (
    <div className="m-auto flex max-w-[320px] flex-col items-center gap-3 p-6 text-center">
      <span
        className={cn(
          'flex size-14 items-center justify-center rounded-full',
          props.tone === 'error' ? 'bg-brand-red-soft text-brand-red' : 'bg-surface-alt text-ink-60',
        )}
      >
        {props.icon}
      </span>
      <h2 className="font-display text-lg font-semibold text-ink">{props.title}</h2>
      <p className="text-sm break-words text-ink-60">{props.text}</p>
      {props.children}
    </div>
  )
}

const EMPTY: Record<TaskView, { title: string; text: string }> = {
  all: { title: 'Задач пока нет', text: 'Создайте первую задачу, чтобы назначить ответственного и срок' },
  mine: { title: 'Нет задач на вас', text: 'Все дела закрыты. Создайте новую задачу' },
  watching: { title: 'Нет задач', text: 'Вы не наблюдаете ни за одной задачей.' },
  created: { title: 'Нет задач', text: 'Вы ещё не создавали задач.' },
  overdue: { title: 'Нет просроченных', text: 'Просроченных задач нет.' },
}

export function TaskList(props: TaskListProps) {
  const { items, loading, error, selectedId, variant = 'compact' } = props
  const layout = useOptionalLayoutMode() ?? 'desktop'
  const grouped = layout !== 'desktop' && props.sort === 'deadline'

  if (loading && items.length === 0) return <ListSkeleton />

  if (error !== null && items.length === 0) {
    return (
      <div role="alert" className="flex flex-1 flex-col">
        <Notice
          icon={<WifiOff size={24} />}
          title="Не удалось загрузить задачи"
          text="Нет связи с сервером. Проверьте подключение и повторите."
          tone="error"
        >
          <Button variant="secondary" className="h-10 rounded-full px-5 text-sm" onClick={props.onRetry}>
            Повторить
          </Button>
        </Notice>
      </div>
    )
  }

  if (items.length === 0) {
    if (props.searching === true) {
      return <TaskSearchEmpty onReset={props.onResetFilters} />
    }
    const view = props.view ?? 'mine'
    const empty = EMPTY[view]
    return (
      <Notice icon={<ListChecks size={24} />} title={empty.title} text={empty.text}>
        {(view === 'mine' || view === 'all') && props.onCreate ? (
          <Button className="h-10 rounded-full px-[18px] text-sm shadow-none" onClick={props.onCreate}>
            <Plus size={16} />
            Создать задачу
          </Button>
        ) : null}
      </Notice>
    )
  }

  return (
    <div className="flex flex-col">
      {error !== null ? (
        <div role="alert" className="mx-3 my-2 flex items-center gap-2 rounded-lg bg-brand-red-soft px-3 py-2 text-[13px] text-brand-red">
          <span className="flex-1">{error}</span>
          <button type="button" className="font-semibold underline" onClick={props.onRetry}>
            Повторить
          </button>
        </div>
      ) : null}
      {grouped ? (
        <div aria-busy={props.refreshing === true ? 'true' : undefined} className={cn('flex flex-col transition-opacity', props.refreshing === true && 'opacity-60')}>
          {groupByDeadline(items, props.now).map((group) => (
            <section key={group.key} aria-label={group.label} className="flex flex-col">
              <h3
                className={cn(
                  'px-3 pt-2.5 pb-1 text-[11px] font-semibold',
                  group.key === 'overdue' ? 'text-brand-red' : 'text-ink-40',
                )}
              >
                {group.label}
              </h3>
              <ul className="flex flex-col gap-0.5 px-2">
                {group.items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={task.id === selectedId}
                    now={props.now}
                    variant={variant}
                    onOpen={props.onOpen}
                    onSetStatus={props.onSetStatus}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul
          aria-busy={props.refreshing === true ? 'true' : undefined}
          className={cn('flex flex-col gap-0.5 px-2 transition-opacity', props.refreshing === true && 'opacity-60')}
        >
          {items.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={task.id === selectedId}
              now={props.now}
              variant={variant}
              onOpen={props.onOpen}
              onSetStatus={props.onSetStatus}
            />
          ))}
        </ul>
      )}
      {props.hasMore ? (
        <div className="flex justify-center px-4 py-3">
          <Button
            variant="secondary"
            className="h-9 rounded-full px-4 text-[13px]"
            disabled={props.loadingMore === true}
            onClick={props.onLoadMore}
          >
            <ChevronsDown size={16} className="text-ink-60" />
            Показать ещё
          </Button>
        </div>
      ) : null}
    </div>
  )
}

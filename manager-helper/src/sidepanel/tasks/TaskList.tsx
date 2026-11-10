import type { Task, TaskStatus } from '@/shared/tasks-api'
import type { TasksView } from '@/shared/tasks-view'
import { CircleCheckIcon, CloudOffIcon, ListIcon, PlusIcon, SortAscIcon } from '../icons'
import { TaskRow } from './TaskRow'

interface Props {
  items: Task[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  remaining: number
  selectedId: string | null
  now?: Date
  /** Selected view; decides the empty-state text. */
  view?: TasksView
  /** A title search is active. */
  searching?: boolean
  /** Всего задач в представлении (загруженные + оставшиеся); без него строка сортировки скрыта. */
  total?: number
  onOpen: (taskId: string) => void
  onSetStatus: (taskId: string, status: TaskStatus) => void
  onLoadMore: () => void
  onRetry: () => void
  onCreate: () => void
}

const primary =
  'inline-flex h-10 items-center gap-2 rounded-xl bg-brand-red px-4.5 text-[15px] font-semibold text-white shadow-[0_6px_12px_#66000033] hover:bg-brand-red-hover'
const secondary =
  'rounded-full border border-field-line bg-white px-5 py-2 text-sm font-semibold text-ink hover:bg-surface-alt disabled:text-ink-40'
const retry =
  'rounded-full border border-brand-red bg-white px-4 py-1.5 text-[13px] font-semibold text-brand-red hover:bg-brand-red-soft'

function Skeleton() {
  return (
    <div role="status" aria-label="Загрузка задач">
      {[72, 55, 80, 60, 70].map((width, index) => (
        <div key={index} className="flex animate-pulse gap-3 border-b border-line px-4 py-3">
          <div className="size-5.5 shrink-0 rounded-full bg-surface-sunken" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 rounded bg-surface-sunken" style={{ width: `${String(width)}%` }} />
            <div className="h-2.5 w-1/3 rounded bg-surface-sunken" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Notice(props: {
  icon: React.ReactNode
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <div className="m-auto flex max-w-72 flex-col items-center gap-2.5 p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-surface-sunken text-ink-60">
        {props.icon}
      </span>
      <h2 className="font-heading text-base font-semibold text-ink">{props.title}</h2>
      <p className="text-[13px] break-words text-ink-60">{props.text}</p>
      {props.children !== null && props.children !== false && <div>{props.children}</div>}
    </div>
  )
}

const EMPTY: Record<TasksView, { title: string; text: string }> = {
  mine: { title: 'Нет задач на вас', text: 'Все дела закрыты. Создайте новую задачу' },
  watching: { title: 'Нет задач', text: 'Вы не наблюдаете ни за одной задачей.' },
  created: { title: 'Нет задач', text: 'Вы ещё не создавали задач.' },
  done: { title: 'Нет задач', text: 'Завершённых задач пока нет.' },
}

/** Порядок, в котором сервер отдаёт задачи представления (см. viewStreamFilters). */
const SORT_LABEL: Record<TasksView, string> = {
  mine: 'По дедлайну',
  watching: 'Сначала обновлённые',
  created: 'Сначала обновлённые',
  done: 'Сначала обновлённые',
}

function pluralizeTasks(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return `${String(count)} задач`
  if (mod10 === 1) return `${String(count)} задача`
  if (mod10 >= 2 && mod10 <= 4) return `${String(count)} задачи`
  return `${String(count)} задач`
}

/** Tasks of the selected view: loading, empty and error states, rows and "Показать ещё". */
export function TaskList(props: Props) {
  const { items, loading, error, selectedId, onOpen, onSetStatus } = props
  const now = props.now ?? new Date()

  if (loading) return <Skeleton />
  if (error !== null && items.length === 0) {
    return (
      <div role="alert" className="flex flex-1 flex-col">
        <Notice icon={<CloudOffIcon size={24} />} title="Не удалось загрузить" text={error}>
          <button type="button" className={retry} onClick={props.onRetry}>
            Повторить
          </button>
        </Notice>
      </div>
    )
  }
  if (items.length === 0) {
    const view = props.view ?? 'mine'
    const empty = EMPTY[view]
    if (props.searching === true) {
      return (
        <Notice icon={<ListIcon />} title="Ничего не найдено" text="По этому запросу задач нет.">
          {null}
        </Notice>
      )
    }
    return (
      <Notice icon={<CircleCheckIcon />} title={empty.title} text={empty.text}>
        {view === 'mine' && (
          <button type="button" className={primary} onClick={props.onCreate}>
            <PlusIcon />
            Создать задачу
          </button>
        )}
      </Notice>
    )
  }
  return (
    <div className="flex flex-col">
      {props.total !== undefined && (
        <p className="flex items-center gap-1.5 px-4 py-2 text-xs text-ink-60">
          <SortAscIcon />
          {`${SORT_LABEL[props.view ?? 'mine']} · ${pluralizeTasks(props.total)}`}
        </p>
      )}
      <ul>
        {items.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            selected={task.id === selectedId}
            now={now}
            onOpen={onOpen}
            onSetStatus={onSetStatus}
          />
        ))}
      </ul>
      {props.hasMore && (
        <div className="flex justify-center px-4 py-4">
          <button
            type="button"
            className={secondary}
            disabled={props.loadingMore}
            onClick={props.onLoadMore}
          >
            {`Показать ещё · ${String(props.remaining)}`}
          </button>
        </div>
      )}
    </div>
  )
}

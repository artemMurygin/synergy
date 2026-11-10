import type { Task, TaskStatus } from '@/shared/tasks-api'
import type { TasksView } from '@/shared/tasks-view'
import { CloudOffIcon, ListIcon } from '../icons'
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
  onOpen: (taskId: string) => void
  onSetStatus: (taskId: string, status: TaskStatus) => void
  onLoadMore: () => void
  onRetry: () => void
  onCreate: () => void
}

const primary =
  'rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover'
const secondary =
  'rounded-full border border-line bg-surface-alt px-5 py-2 text-sm font-semibold text-ink hover:bg-surface-sunken disabled:text-ink-40'

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
    <div className="m-auto flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="text-ink-40">{props.icon}</span>
      <h2 className="text-sm font-bold text-ink">{props.title}</h2>
      <p className="text-xs break-words text-ink-60">{props.text}</p>
      <div className="mt-2">{props.children}</div>
    </div>
  )
}

const EMPTY_TEXT: Record<TasksView, string> = {
  mine: 'У вас нет незавершённых задач.',
  watching: 'Вы не наблюдаете ни за одной задачей.',
  created: 'Вы ещё не создавали задач.',
  done: 'Завершённых задач пока нет.',
}

/** Tasks of the selected view: loading, empty and error states, rows and "Показать ещё". */
export function TaskList(props: Props) {
  const { items, loading, error, selectedId, onOpen, onSetStatus } = props
  const now = props.now ?? new Date()

  if (loading) return <Skeleton />
  if (error !== null && items.length === 0) {
    return (
      <div role="alert" className="flex flex-1 flex-col">
        <Notice icon={<CloudOffIcon />} title="Не удалось загрузить задачи" text={error}>
          <button type="button" className={secondary} onClick={props.onRetry}>
            Повторить
          </button>
        </Notice>
      </div>
    )
  }
  if (items.length === 0) {
    const view = props.view ?? 'mine'
    if (props.searching === true) {
      return (
        <Notice icon={<ListIcon />} title="Ничего не найдено" text="По этому запросу задач нет.">
          {null}
        </Notice>
      )
    }
    return (
      <Notice icon={<ListIcon />} title="Задач нет" text={EMPTY_TEXT[view]}>
        {view === 'mine' && (
          <button type="button" className={primary} onClick={props.onCreate}>
            Создать задачу
          </button>
        )}
      </Notice>
    )
  }
  return (
    <div className="flex flex-col">
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

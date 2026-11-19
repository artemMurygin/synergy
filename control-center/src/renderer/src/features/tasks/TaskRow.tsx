import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/lib/backend/tasks.schema'
import { DeadlineLabel } from './DeadlineLabel'
import { StatusBadge } from './StatusBadge'
import { UserAvatar } from './UserAvatar'
import { STATUS_META } from './status'

interface TaskRowProps {
  task: Task
  selected: boolean
  now?: Date
  onSelect: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => void
}

// Columns from the design: title (fill) | assignee 150 | deadline 150 | status 132
export const TASK_GRID = 'grid grid-cols-[minmax(0,1fr)_150px_150px_132px] items-center gap-4'

const INACTIVE_USER = 'Неактивный пользователь'

/** Russian plural for "вложение": 1 вложение, 2 вложения, 5 вложений. */
export function attachmentsLabel(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} вложение`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} вложения`
  return `${n} вложений`
}

/** "Создал anna · 2 вложения" line under the title. */
export function taskMeta(task: Task): string {
  const creator = `Создал ${task.creator.login ?? INACTIVE_USER}`
  return task.attachmentCount > 0 ? `${creator} · ${attachmentsLabel(task.attachmentCount)}` : creator
}

function StatusToggleIcon({ status }: { status: TaskStatus }) {
  if (status === 'done') {
    return (
      <span aria-hidden className="flex size-[22px] items-center justify-center rounded-full bg-success">
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </span>
    )
  }
  const Icon = STATUS_META[status].icon
  return <Icon aria-hidden className={cn('size-[22px]', STATUS_META[status].iconClass)} />
}

function Assignee({ task }: { task: Task }) {
  if (!task.assignee) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <UserAvatar login={null} />
        <span className="truncate text-[13px] text-ink-40">Не назначен</span>
      </span>
    )
  }
  const login = task.assignee.login
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar login={login} />
      <span className={cn('truncate text-[13px] font-medium', login ? 'text-ink' : 'text-ink-60')}>
        {login ?? INACTIVE_USER}
      </span>
    </span>
  )
}

export function TaskRow({ task, selected, now, onSelect, onStatusChange }: TaskRowProps) {
  const done = task.status === 'done'
  const next: TaskStatus = done ? 'todo' : 'done'
  const toggleLabel = `${done ? 'Вернуть в работу' : 'Отметить выполненной'}: ${task.title}`

  return (
    <li
      className={cn(
        // focus ring of the open button is drawn on the whole row, inset so it is not clipped
        'flex min-h-16 items-center gap-4 border-b px-6 has-[[data-task-id]:focus-visible]:ring-2 has-[[data-task-id]:focus-visible]:ring-brand-red/40 has-[[data-task-id]:focus-visible]:ring-inset',
        selected ? 'bg-brand-red-soft' : 'hover:bg-surface-alt'
      )}
    >
      <button
        type="button"
        aria-label={toggleLabel}
        onClick={() => onStatusChange(task.id, next)}
        className="relative flex size-[22px] shrink-0 items-center justify-center rounded-full outline-none before:absolute before:-inset-[5px] focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-2"
      >
        <StatusToggleIcon status={task.status} />
      </button>
      <button
        type="button"
        aria-label={`Открыть задачу: ${task.title}`}
        data-task-id={task.id}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(task.id)}
        className={cn('min-w-0 flex-1 self-stretch py-2.5 text-left outline-none', TASK_GRID)}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn('line-clamp-2 text-[15px] leading-5 font-semibold break-words', done ? 'text-ink-60' : 'text-ink')}>
            {task.title}
          </span>
          <span className="truncate text-xs text-ink-60">{taskMeta(task)}</span>
        </span>
        <Assignee task={task} />
        <DeadlineLabel status={task.status} deadline={task.deadline} completedAt={task.completedAt} now={now} />
        <span>
          <StatusBadge status={task.status} />
        </span>
      </button>
    </li>
  )
}

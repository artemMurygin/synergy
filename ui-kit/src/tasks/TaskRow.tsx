import { Check, Clock } from '../icons'
import { cn } from '../lib/cn'
import { DeadlineLabel } from './DeadlineLabel'
import { StatusBadge } from './StatusBadge'
import { loginOf, type TaskItem, type TaskStatus } from './types'
import { UserAvatar } from './UserAvatar'

export type TaskRowProps = {
  task: TaskItem
  selected?: boolean
  now?: Date
  /** wide — таблица (desktop), compact — двухстрочная (planшет и мобильный). */
  variant?: 'wide' | 'compact'
  onOpen: (taskId: string) => void
  onSetStatus?: (taskId: string, status: TaskStatus) => void
}

const CIRCLE: Record<TaskStatus, string> = {
  todo: 'border-ink-40 text-transparent',
  in_progress: 'border-info text-info',
  done: 'border-success bg-success text-white',
}

export function pluralizeAttachments(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return `${String(count)} вложений`
  if (mod10 === 1) return `${String(count)} вложение`
  if (mod10 >= 2 && mod10 <= 4) return `${String(count)} вложения`
  return `${String(count)} вложений`
}

export function TaskRow({ task, selected = false, now, variant = 'compact', onOpen, onSetStatus }: TaskRowProps) {
  const done = task.status === 'done'
  const wide = variant === 'wide'
  const meta = [`Создал ${loginOf(task.creator)}`, task.attachmentCount > 0 ? pluralizeAttachments(task.attachmentCount) : null]
    .filter(Boolean)
    .join(' · ')

  const toggle = (
    <button
      type="button"
      aria-label={`${done ? 'Вернуть к выполнению' : 'Отметить выполненной'}: ${task.title}`}
      disabled={!onSetStatus}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40',
        CIRCLE[task.status],
      )}
      onClick={() => {
        onSetStatus?.(task.id, done ? 'todo' : 'done')
      }}
    >
      {done ? <Check size={12} strokeWidth={3} /> : task.status === 'in_progress' ? <Clock size={12} /> : null}
    </button>
  )

  const title = (
    <button
      type="button"
      data-task-id={task.id}
      aria-current={selected ? 'true' : undefined}
      onClick={() => {
        onOpen(task.id)
      }}
      className={cn(
        'block w-full text-left text-sm font-semibold break-words outline-none focus-visible:underline',
        done ? 'text-ink-60' : 'text-ink',
        !wide && 'line-clamp-2',
      )}
    >
      {task.title}
    </button>
  )

  if (wide) {
    return (
      <li className={cn('flex min-h-[60px] items-center gap-3.5 rounded-[14px] px-3.5', selected && 'bg-brand-red-soft')}>
        {toggle}
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          {title}
          <p className="truncate text-xs text-ink-60">{meta}</p>
        </div>
        <div className="flex w-[130px] shrink-0 items-center gap-2">
          <UserAvatar login={task.assignee?.login ?? null} />
          <span className={cn('truncate text-[13px] font-medium', task.assignee ? 'text-ink' : 'text-ink-40')}>
            {loginOf(task.assignee)}
          </span>
        </div>
        <div className="w-[140px] shrink-0">
          <DeadlineLabel deadline={task.deadline} status={task.status} now={now} />
        </div>
        <div className="w-[120px] shrink-0">
          <StatusBadge status={task.status} />
        </div>
      </li>
    )
  }

  return (
    <li className={cn('flex items-start gap-3 rounded-[14px] p-3', selected && 'bg-brand-red-soft')}>
      <span className="mt-0.5">{toggle}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {title}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <StatusBadge status={task.status} />
          <DeadlineLabel deadline={task.deadline} status={task.status} now={now} className="text-xs" />
        </div>
      </div>
      <UserAvatar login={task.assignee?.login ?? null} size="sm" />
    </li>
  )
}

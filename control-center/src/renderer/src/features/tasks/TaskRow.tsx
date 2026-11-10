import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/lib/backend/tasks.schema'
import { DeadlineLabel } from './DeadlineLabel'
import { StatusBadge } from './StatusBadge'
import { STATUS_META } from './status'

interface TaskRowProps {
  task: Task
  selected: boolean
  now?: Date
  onSelect: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => void
}

export const TASK_GRID = 'grid grid-cols-[minmax(0,1fr)_140px_160px_130px] items-center gap-4'

export function TaskRow({ task, selected, now, onSelect, onStatusChange }: TaskRowProps) {
  const done = task.status === 'done'
  const Icon = STATUS_META[task.status].icon
  const next: TaskStatus = done ? 'todo' : 'done'
  const toggleLabel = `${done ? 'Вернуть в работу' : 'Отметить выполненной'}: ${task.title}`

  return (
    <li className={cn('flex items-center gap-3 border-b px-4', selected ? 'bg-brand-red-soft' : 'hover:bg-surface-alt')}>
      <button
        type="button"
        aria-label={toggleLabel}
        onClick={() => onStatusChange(task.id, next)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon aria-hidden className={cn('size-5', STATUS_META[task.status].iconClass)} />
      </button>
      <button
        type="button"
        aria-label={`Открыть задачу: ${task.title}`}
        data-task-id={task.id}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(task.id)}
        className={cn('min-w-0 flex-1 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', TASK_GRID)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('truncate text-sm font-semibold', done && 'text-ink-60')}>{task.title}</span>
          {task.attachmentCount > 0 && (
            <span aria-label={`Вложений: ${task.attachmentCount}`} className="flex shrink-0 items-center gap-1 text-xs text-ink-60">
              <Paperclip aria-hidden className="size-3.5" />
              {task.attachmentCount}
            </span>
          )}
        </span>
        <span className="truncate text-[13px] text-ink-60">{task.assignee ? (task.assignee.login ?? 'Неактивный пользователь') : 'Не назначен'}</span>
        <DeadlineLabel status={task.status} deadline={task.deadline} now={now} />
        <span>
          <StatusBadge status={task.status} />
        </span>
      </button>
    </li>
  )
}

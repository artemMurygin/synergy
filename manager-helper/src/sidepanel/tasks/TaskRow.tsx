import type { Task, TaskStatus } from '@/shared/tasks-api'
import { CheckIcon, ClockIcon } from '../icons'
import { DeadlineLabel } from './DeadlineLabel'
import { StatusBadge } from './StatusBadge'

interface Props {
  task: Task
  selected: boolean
  now: Date
  onOpen: (taskId: string) => void
  onSetStatus: (taskId: string, status: TaskStatus) => void
}

const CIRCLE: Record<TaskStatus, string> = {
  todo: 'border-ink-40 text-transparent',
  in_progress: 'border-info text-info',
  done: 'border-accent-green bg-accent-green text-white',
}

/** Compact two-line task row: status circle, title, deadline and status badge. */
export function TaskRow({ task, selected, now, onOpen, onSetStatus }: Props) {
  const done = task.status === 'done'
  return (
    <li
      className={`flex items-start gap-3 border-b border-line px-4 py-3 ${
        selected ? 'bg-surface-alt' : ''
      }`}
    >
      <button
        type="button"
        aria-label={`${done ? 'Вернуть к выполнению' : 'Отметить выполненной'}: ${task.title}`}
        className={`mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 ${CIRCLE[task.status]}`}
        onClick={() => {
          onSetStatus(task.id, done ? 'todo' : 'done')
        }}
      >
        {done ? <CheckIcon /> : task.status === 'in_progress' ? <ClockIcon /> : null}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          aria-current={selected ? 'true' : undefined}
          className={`block w-full text-left text-sm font-semibold break-words ${
            done ? 'text-ink-60' : 'text-ink'
          }`}
          onClick={() => {
            onOpen(task.id)
          }}
        >
          {task.title}
        </button>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <DeadlineLabel deadline={task.deadline} status={task.status} now={now} />
          <StatusBadge status={task.status} />
        </div>
      </div>
    </li>
  )
}

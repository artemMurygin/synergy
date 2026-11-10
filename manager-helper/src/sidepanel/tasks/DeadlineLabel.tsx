import type { TaskStatus } from '@/shared/tasks-api'
import { AlarmIcon, CalendarIcon } from '../icons'
import { formatDay, formatDeadline, isOverdue } from './format'

interface Props {
  deadline: string | null
  status: TaskStatus
  now: Date
}

/** Deadline; an overdue one is marked with the word "Просрочено", not only with colour. */
export function DeadlineLabel({ deadline, status, now }: Props) {
  if (deadline === null) return <span className="text-[13px] text-ink-60">Без срока</span>
  if (isOverdue(deadline, status, now)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-red">
        <AlarmIcon />
        {`Просрочено · ${formatDay(deadline)}`}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-60">
      <CalendarIcon />
      {formatDeadline(deadline)}
    </span>
  )
}

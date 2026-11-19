import { AlarmClock, Calendar } from '../icons'
import { cn } from '../lib/cn'
import { formatDay, formatDeadline, isOverdue } from './deadline'
import type { TaskStatus } from './types'

export type DeadlineLabelProps = {
  deadline: string | null
  status: TaskStatus
  now?: Date
  className?: string
}

/** Дедлайн; просроченный подписан словом «Просрочено», а не только цветом. */
export function DeadlineLabel({ deadline, status, now, className }: DeadlineLabelProps) {
  if (deadline === null) return <span className={cn('text-[13px] text-ink-60', className)}>Без срока</span>
  if (isOverdue(status, deadline, now)) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-red', className)}>
        <AlarmClock size={14} />
        {`Просрочено · ${formatDay(deadline)}`}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] text-ink-60', className)}>
      <Calendar size={14} />
      {formatDeadline(deadline)}
    </span>
  )
}

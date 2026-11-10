import { AlarmClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/lib/backend/tasks.schema'
import { isOverdue } from './status'

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso))

interface DeadlineLabelProps {
  status: TaskStatus
  deadline: string | null
  now?: Date
}

export function DeadlineLabel({ status, deadline, now }: DeadlineLabelProps) {
  if (status === 'done') return <span className="text-[13px] text-ink-60">Закрыто</span>
  if (deadline === null) return <span className="text-[13px] text-ink-60">Без срока</span>
  if (isOverdue(status, deadline, now)) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-red">
        <AlarmClock aria-hidden className="size-3.5" />
        Просрочено · {formatDate(deadline)}
      </span>
    )
  }
  return <span className={cn('text-[13px] text-foreground')}>{formatDate(deadline)}</span>
}

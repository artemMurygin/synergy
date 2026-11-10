import { AlarmClock, Calendar } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/lib/backend/tasks.schema'
import { isOverdue } from './status'

// Short month names as in the design ("12 дек"), Intl adds dots and longer forms
const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const pad = (n: number): string => String(n).padStart(2, '0')

/** "5 ноя" in local time. */
export function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

/** "12 дек, 18:00"; the time is omitted when it is exactly midnight. */
export function formatShortDateTime(iso: string): string {
  const d = new Date(iso)
  const date = formatShortDate(iso)
  if (d.getHours() === 0 && d.getMinutes() === 0) return date
  return `${date}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface DeadlineLabelProps {
  status: TaskStatus
  deadline: string | null
  /** Closing time of a done task, shown as "Закрыто 7 ноя". */
  completedAt?: string | null
  now?: Date
}

function Label({ icon, className, children }: { icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink-60', className)}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

const calendarIcon = <Calendar aria-hidden className="size-3.5 shrink-0 text-ink-60" />

export function DeadlineLabel({ status, deadline, completedAt, now }: DeadlineLabelProps) {
  if (status === 'done') {
    return <Label icon={calendarIcon}>{completedAt ? `Закрыто ${formatShortDate(completedAt)}` : 'Закрыто'}</Label>
  }
  if (deadline === null) return <Label icon={calendarIcon}>Без срока</Label>
  if (isOverdue(status, deadline, now)) {
    return (
      <Label icon={<AlarmClock aria-hidden className="size-3.5 shrink-0" />} className="text-brand-red">
        Просрочено · {formatShortDate(deadline)}
      </Label>
    )
  }
  return <Label icon={calendarIcon}>{formatShortDateTime(deadline)}</Label>
}

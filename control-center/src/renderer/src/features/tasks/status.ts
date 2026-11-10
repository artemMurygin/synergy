import { CheckCircle2, Clock, Circle, type LucideIcon } from 'lucide-react'
import type { TaskStatus } from '@/lib/backend/tasks.schema'

interface StatusMeta {
  label: string
  icon: LucideIcon
  /** Colour of the circle/icon in the row. */
  iconClass: string
  /** Colours of the badge (background, dot and text). */
  badgeClass: string
  dotClass: string
}

// Status encoding from the design: text is always shown, colour is an extra signal
export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  todo: {
    label: 'К выполнению',
    icon: Circle,
    iconClass: 'text-ink-40',
    badgeClass: 'bg-surface-sunken text-ink-60',
    dotClass: 'bg-ink-60'
  },
  in_progress: {
    label: 'В работе',
    icon: Clock,
    iconClass: 'text-info',
    badgeClass: 'bg-info-soft text-info',
    dotClass: 'bg-info'
  },
  done: {
    label: 'Готово',
    icon: CheckCircle2,
    iconClass: 'text-success',
    badgeClass: 'bg-success-soft text-success',
    dotClass: 'bg-success'
  }
}

/** Overdue: an open task whose deadline is in the past. */
export function isOverdue(status: TaskStatus, deadline: string | null, now: Date = new Date()): boolean {
  if (status === 'done' || deadline === null) return false
  return new Date(deadline).getTime() < now.getTime()
}

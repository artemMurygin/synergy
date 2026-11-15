import type { BadgeProps } from '@/components/ui/badge'
import { BUG_STATUSES, type BugQueueFilterValue, type BugStatus } from './bugs.schema'

export const BUG_STATUS_LABELS: Record<BugStatus, string> = {
  open: 'Открыт',
  in_progress: 'В работе',
  resolved: 'Исправлен',
  wont_fix: 'Не будет исправлен'
}

export interface BugStatusPresentation {
  label: string
  tone: NonNullable<BadgeProps['tone']>
  /** Text override: `warning` on `warning-soft` is unreadable, so «Открыт» uses `ink-80` (ui-design, «Отклонения» п. 2). */
  className?: string
}

export const BUG_STATUS_PRESENTATION: Record<BugStatus, BugStatusPresentation> = {
  open: { label: BUG_STATUS_LABELS.open, tone: 'warning', className: 'text-ink-80' },
  in_progress: { label: BUG_STATUS_LABELS.in_progress, tone: 'info' },
  resolved: { label: BUG_STATUS_LABELS.resolved, tone: 'success' },
  wont_fix: { label: BUG_STATUS_LABELS.wont_fix, tone: 'neutral' }
}

export const BUG_QUEUE_FILTERS: { id: BugQueueFilterValue; label: string }[] = [
  { id: 'unclosed', label: 'Незакрытые' },
  ...BUG_STATUSES.map((id) => ({ id, label: BUG_STATUS_LABELS[id] }))
]

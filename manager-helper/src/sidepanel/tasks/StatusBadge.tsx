import type { TaskStatus } from '@/shared/tasks-api'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово',
}

const STYLE: Record<TaskStatus, { badge: string; dot: string }> = {
  todo: { badge: 'bg-surface-sunken text-ink-80', dot: 'bg-ink-60' },
  in_progress: { badge: 'bg-info-soft text-info', dot: 'bg-info' },
  done: { badge: 'bg-success-soft text-accent-green', dot: 'bg-accent-green' },
}

/** Status as text with a dot: the colour is only an extra signal. */
export function StatusBadge({ status }: { status: TaskStatus }) {
  const { badge, dot } = STYLE[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}

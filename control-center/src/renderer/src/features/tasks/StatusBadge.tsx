import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/lib/backend/tasks.schema'
import { STATUS_META } from './status'

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
        meta.badgeClass
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', meta.dotClass)} />
      {meta.label}
    </span>
  )
}

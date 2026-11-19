import { Badge } from '../primitives/Badge'
import { STATUS_LABEL, type TaskStatus } from './types'

const VARIANT = { todo: 'neutral', in_progress: 'info', done: 'success' } as const

/** Статус текстом с точкой: цвет — лишь дополнительный сигнал. */
export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Badge variant={VARIANT[status]} dot className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { REQUEST_BADGE_CLASS, REQUEST_STATUS_LABEL } from '@/lib/status-labels'
import type { RequestStatusCode } from '@/lib/schemas'

const TONE: Record<RequestStatusCode, NonNullable<BadgeProps['tone']>> = {
  new: 'neutral',
  under_review: 'neutral',
  rejected: 'red',
  planned: 'neutral',
  in_dev: 'info',
  testing: 'warning',
  launched: 'success',
  rework: 'warning'
}

export function RequestStatusBadge({ status }: { status: RequestStatusCode }) {
  const className = status === 'new' || status === 'under_review' ? REQUEST_BADGE_CLASS[status] : undefined
  return (
    <Badge tone={TONE[status]} className={className}>
      {REQUEST_STATUS_LABEL[status]}
    </Badge>
  )
}

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { REQUEST_STATUS_LABEL } from '@/lib/status-labels'
import type { RequestStatusCode } from '@/lib/schemas'

const TONE: Record<RequestStatusCode, NonNullable<BadgeProps['tone']>> = {
  pending: 'neutral',
  rejected: 'red',
  planned: 'neutral',
  in_dev: 'info',
  testing: 'warning',
  launched: 'success'
}

export function RequestStatusBadge({ status }: { status: RequestStatusCode }) {
  return <Badge tone={TONE[status]}>{REQUEST_STATUS_LABEL[status]}</Badge>
}

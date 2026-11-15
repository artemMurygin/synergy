import { Badge } from '@/components/ui/badge'
import type { AgentStatusCode } from '@/lib/schemas'
import { AGENT_BADGE_CLASS, AGENT_STATUS_LABEL } from '@/lib/status-labels'

export function AgentStatusBadge({ status }: { status: AgentStatusCode }) {
  return (
    <Badge tone="neutral" className={AGENT_BADGE_CLASS[status]}>
      {AGENT_STATUS_LABEL[status]}
    </Badge>
  )
}

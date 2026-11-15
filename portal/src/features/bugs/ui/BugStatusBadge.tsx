import { Badge } from '@/components/ui/badge'
import { BUG_STATUS_PRESENTATION } from '../model/bug-presentation'
import type { BugStatus } from '../model/bugs.schema'

/** Tones of frame LuTBN; the shared Badge stays untouched, «Открыт» gets a readable text colour via className. */
export function BugStatusBadge({ status }: { status: BugStatus }) {
  const { label, tone, className } = BUG_STATUS_PRESENTATION[status]
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  )
}

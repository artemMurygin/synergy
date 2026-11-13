import { authorizedRequest } from '@/features/auth'
import { pageSchema, requestSchema, type IdeaRequest } from '@/lib/schemas'

export const QUEUE_PAGE_SIZE = 20

const queuePageSchema = pageSchema(requestSchema)
export type QueuePage = ReturnType<typeof queuePageSchema.parse>

/** Accept into an existing skill, or create a new one at an agent; the two forms never mix. */
export type AcceptTarget = { skillId: string } | { agentId: string; name: string; description: string }

export function listQueue(page: number): Promise<QueuePage> {
  return authorizedRequest('/portal/queue', { query: { page, limit: QUEUE_PAGE_SIZE }, schema: queuePageSchema })
}

export function acceptRequest(requestId: string, target: AcceptTarget): Promise<IdeaRequest> {
  return authorizedRequest(`/portal/requests/${requestId}/accept`, {
    method: 'POST',
    body: target,
    schema: requestSchema
  })
}

export function rejectRequest(requestId: string, reason: string): Promise<IdeaRequest> {
  return authorizedRequest(`/portal/requests/${requestId}/reject`, {
    method: 'POST',
    body: { reason },
    schema: requestSchema
  })
}

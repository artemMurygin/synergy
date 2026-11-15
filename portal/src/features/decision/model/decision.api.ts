import { authorizedRequest } from '@/features/auth'
import { pageSchema, requestSchema, type IdeaRequest } from '@/lib/schemas'

export const QUEUE_PAGE_SIZE = 20

const queuePageSchema = pageSchema(requestSchema)
export type QueuePage = ReturnType<typeof queuePageSchema.parse>

/** What an accepted request turns into; `kind` selects exactly one of the three forms. */
export type AcceptTarget =
  | { kind: 'existing_skill'; skillId: string }
  | { kind: 'new_skill'; agentId: string; name: string; description: string }
  | {
      kind: 'new_agent'
      agent: { name: string; productIds: string[]; newProduct?: { name: string } }
      skill: { name: string; description: string }
    }

export interface AcceptBody {
  effortHours: number
  target: AcceptTarget
}

export function listQueue(page: number): Promise<QueuePage> {
  return authorizedRequest('/portal/queue', { query: { page, limit: QUEUE_PAGE_SIZE }, schema: queuePageSchema })
}

export function takeRequest(requestId: string): Promise<IdeaRequest> {
  return authorizedRequest(`/portal/requests/${requestId}/take`, { method: 'POST', schema: requestSchema })
}

export function acceptRequest(requestId: string, body: AcceptBody): Promise<IdeaRequest> {
  return authorizedRequest(`/portal/requests/${requestId}/accept`, {
    method: 'POST',
    body,
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

import { authorizedRequest } from '@/features/auth'
import { pageSchema, requestSchema, type IdeaRequest } from '@/lib/schemas'
import type { RequestBody } from './requests.schema'

export const REQUESTS_PAGE_SIZE = 20

const requestsPageSchema = pageSchema(requestSchema)
export type RequestsPage = ReturnType<typeof requestsPageSchema.parse>

export function submitRequest(body: RequestBody): Promise<IdeaRequest> {
  return authorizedRequest('/portal/requests', { method: 'POST', body, schema: requestSchema })
}

export function listMyRequests(page: number): Promise<RequestsPage> {
  return authorizedRequest('/portal/requests/my', {
    query: { page, limit: REQUESTS_PAGE_SIZE },
    schema: requestsPageSchema
  })
}

export function getRequest(id: string): Promise<IdeaRequest> {
  return authorizedRequest(`/portal/requests/${id}`, { schema: requestSchema })
}

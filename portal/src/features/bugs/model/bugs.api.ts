import { authorizedRequest } from '@/features/auth'
import {
  bugResponseSchema,
  bugsPageSchema,
  type BugQueueFilterValue,
  type BugResponse,
  type BugsPage,
  type ChangeBugStatusBody,
  type ReportBugBody
} from './bugs.schema'

export const BUGS_PAGE_SIZE = 20

export function reportBug(body: ReportBugBody): Promise<BugResponse> {
  return authorizedRequest('/portal/bugs', { method: 'POST', body, schema: bugResponseSchema })
}

export function listMyBugs(page: number): Promise<BugsPage> {
  return authorizedRequest('/portal/bugs/my', { query: { page, limit: BUGS_PAGE_SIZE }, schema: bugsPageSchema })
}

export function listBugQueue(filter: BugQueueFilterValue, page: number): Promise<BugsPage> {
  return authorizedRequest('/portal/bugs/queue', {
    query: { status: filter === 'unclosed' ? undefined : filter, page, limit: BUGS_PAGE_SIZE },
    schema: bugsPageSchema
  })
}

export function getBug(id: string): Promise<BugResponse> {
  return authorizedRequest(`/portal/bugs/${encodeURIComponent(id)}`, { schema: bugResponseSchema })
}

export function changeBugStatus(id: string, body: ChangeBugStatusBody): Promise<BugResponse> {
  return authorizedRequest(`/portal/bugs/${encodeURIComponent(id)}/status`, { method: 'POST', body, schema: bugResponseSchema })
}

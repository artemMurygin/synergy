import { z } from 'zod'
import { pageSchema } from '@/lib/schemas'

export const BUG_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix'] as const
export const bugStatusSchema = z.enum(BUG_STATUSES)
export type BugStatus = z.infer<typeof bugStatusSchema>

/** «Незакрытые» is the queue default: the server gets no `status` and returns open + in_progress. */
export type BugQueueFilterValue = 'unclosed' | BugStatus

const personSchema = z.object({ id: z.string(), login: z.string(), fullName: z.string() })
const refSchema = z.object({ id: z.string(), name: z.string() })

export const bugResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  product: refSchema,
  agent: refSchema,
  author: personSchema,
  status: bugStatusSchema,
  createdAt: z.string(),
  statusChangedAt: z.string(),
  statusChangedBy: personSchema.nullable(),
  wontFixReason: z.string().nullable(),
  nextStatuses: z.array(bugStatusSchema)
})
export type BugResponse = z.infer<typeof bugResponseSchema>
export type Bug = BugResponse

export const bugListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  product: refSchema,
  agent: refSchema,
  status: bugStatusSchema,
  createdAt: z.string(),
  statusChangedAt: z.string(),
  author: personSchema
})
export type BugListItem = z.infer<typeof bugListItemSchema>

export const bugsPageSchema = pageSchema(bugListItemSchema)
export type BugsPage = z.infer<typeof bugsPageSchema>

export interface ReportBugBody {
  title: string
  description: string
  productId: string
  agentId: string
}

export interface ChangeBugStatusBody {
  status: BugStatus
  reason?: string
}

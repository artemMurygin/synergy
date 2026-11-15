import type { QueryClient } from '@tanstack/react-query'
import { REQUESTS_KEY, requestQuery } from '@/features/requests'
import { ApiError } from '@/lib/errors'
import { AGENTS_KEY, CATALOG_KEY, SKILLS_KEY } from '@/lib/query-keys'
import type { IdeaRequest } from '@/lib/schemas'
import type { QueuePage } from './decision.api'
import { QUEUE_KEY } from './decision.queries'

/** A decided request leaves the queue at once; the queue is then reloaded from the server. */
export async function applyDecision(client: QueryClient, decided: IdeaRequest): Promise<void> {
  client.setQueriesData<QueuePage>({ queryKey: QUEUE_KEY }, (page) =>
    page
      ? { ...page, items: page.items.filter((r) => r.id !== decided.id), total: Math.max(0, page.total - 1) }
      : page
  )
  await Promise.all([
    client.invalidateQueries({ queryKey: QUEUE_KEY }),
    client.invalidateQueries({ queryKey: REQUESTS_KEY }),
    client.invalidateQueries({ queryKey: SKILLS_KEY })
  ])
}

export const ARCHIVE_ERROR_CODES = ['PORTAL_SKILL_ARCHIVED', 'PORTAL_AGENT_ARCHIVED'] as const

export const isArchiveConflict = (error: unknown): boolean =>
  error instanceof ApiError && error.code !== null && (ARCHIVE_ERROR_CODES as readonly string[]).includes(error.code)

/**
 * A 409 means the decision could not be taken. A request that is already decided: reload the queue and the request.
 * The skill or its agent went to the archive: the request stays pending on screen, only skills and agents are reloaded.
 */
export async function refreshAfterConflict(client: QueryClient, error?: unknown): Promise<void> {
  if (isArchiveConflict(error)) {
    await Promise.all([SKILLS_KEY, AGENTS_KEY, CATALOG_KEY].map((queryKey) => client.invalidateQueries({ queryKey })))
    return
  }
  await Promise.all([
    client.invalidateQueries({ queryKey: QUEUE_KEY }),
    client.invalidateQueries({ queryKey: REQUESTS_KEY })
  ])
}

export const NAME_CONFLICT_CODES = ['PORTAL_AGENT_NAME_TAKEN', 'PORTAL_PRODUCT_NAME_TAKEN'] as const

/** A busy agent or product name is a form error: the request and the queue did not change, nothing to reload. */
export const isNameConflict = (error: unknown): boolean =>
  error instanceof ApiError && error.code !== null && (NAME_CONFLICT_CODES as readonly string[]).includes(error.code)

/** A taken request is shown as under review at once; the queue is then reloaded from the server. */
export async function applyTaken(client: QueryClient, taken: IdeaRequest): Promise<void> {
  client.setQueryData(requestQuery(taken.id).queryKey, taken)
  await client.invalidateQueries({ queryKey: QUEUE_KEY })
}

/** Someone else took or decided the request first: reload the request itself and the queue. */
export async function refreshAfterTakeConflict(client: QueryClient, requestId: string): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: requestQuery(requestId).queryKey }),
    client.invalidateQueries({ queryKey: QUEUE_KEY })
  ])
}

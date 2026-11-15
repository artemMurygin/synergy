import type { QueryClient } from '@tanstack/react-query'
import { REQUESTS_KEY } from '@/features/requests'
import { SKILLS_KEY } from '@/lib/query-keys'
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

/** A 409 means somebody decided first: reload the queue and the request. */
export async function refreshAfterConflict(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: QUEUE_KEY }),
    client.invalidateQueries({ queryKey: REQUESTS_KEY })
  ])
}

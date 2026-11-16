import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { ApiError } from '@/lib/errors'
import { BUGS_KEY } from '@/lib/query-keys'
import { getBug, listBugQueue, listMyBugs } from './bugs.api'
import type { BugQueueFilterValue } from './bugs.schema'

export const MY_BUGS_KEY = [...BUGS_KEY, 'my'] as const
export const BUG_QUEUE_KEY = [...BUGS_KEY, 'queue'] as const

const ID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function notFound(): ApiError {
  return new ApiError('not_found', 'Обращение не найдено', 404)
}

export function myBugsQuery(page: number) {
  return queryOptions({
    queryKey: [...MY_BUGS_KEY, page],
    queryFn: () => listMyBugs(page),
    refetchOnMount: 'always',
    staleTime: 0
  })
}

export function bugQueueQuery(filter: BugQueueFilterValue, page: number) {
  return queryOptions({
    queryKey: [...BUG_QUEUE_KEY, filter, page],
    queryFn: () => listBugQueue(filter, page),
    // a filter or page change keeps the shown list instead of a loading indicator
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    staleTime: 0
  })
}

export function bugDetailKey(id: string) {
  return [...BUGS_KEY, 'detail', id] as const
}

export function bugQuery(id: string) {
  return queryOptions({
    queryKey: bugDetailKey(id),
    queryFn: async () => {
      if (!ID_FORMAT.test(id)) throw notFound()
      try {
        return await getBug(id)
      } catch (error) {
        // a missing, foreign or malformed bug all look the same to the user
        if (error instanceof ApiError && (error.kind === 'not_found' || error.kind === 'bad_request')) throw notFound()
        throw error
      }
    },
    refetchOnMount: 'always',
    retry: (failureCount, error) => !(error instanceof ApiError && error.kind === 'not_found') && failureCount < 2
  })
}

export function isBugNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'not_found'
}

import { useQuery } from '@tanstack/react-query'
import { bugQueueQuery, type BugQueueFilterValue } from '@/features/bugs'

/** One page of the bug queue; a filter or page change keeps the shown list while the next one loads. */
export function useBugQueue(filter: BugQueueFilterValue, page: number) {
  return useQuery(bugQueueQuery(filter, page))
}

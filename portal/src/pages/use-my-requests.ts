import { useQuery } from '@tanstack/react-query'
import { myRequestsQuery } from '@/features/requests'

/** The author's requests of one page; refetched on every mount so the status is always actual. */
export function useMyRequests(page: number) {
  return useQuery(myRequestsQuery(page))
}

import { useQuery } from '@tanstack/react-query'
import { myBugsQuery } from '@/features/bugs'

/** The author's bugs of one page; refetched on every mount so the status is always actual. */
export function useMyBugs(page: number) {
  return useQuery(myBugsQuery(page))
}

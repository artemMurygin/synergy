import { useQuery } from '@tanstack/react-query'
import { bugQuery, isBugNotFound } from '@/features/bugs'

/** One bug by id; a missing, foreign or malformed id is reported as `notFound`. */
export function useBug(id: string) {
  const query = useQuery(bugQuery(id))
  return { ...query, notFound: isBugNotFound(query.error) }
}

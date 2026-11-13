import { useQuery } from '@tanstack/react-query'
import { isRequestNotFound, requestQuery } from '@/features/requests'

/** One request by id; a missing, foreign or malformed id is reported as `notFound`. */
export function useRequest(id: string) {
  const query = useQuery(requestQuery(id))
  return { ...query, notFound: isRequestNotFound(query.error) }
}

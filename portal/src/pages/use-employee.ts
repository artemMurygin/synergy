import { useQuery } from '@tanstack/react-query'
import { employeeQuery } from '@/features/employees'
import { ApiError } from '@/lib/errors'

/** One employee card by id; a missing or malformed id is reported as `notFound`. */
export function useEmployee(id: string) {
  const query = useQuery(employeeQuery(id))
  const notFound = query.error instanceof ApiError && (query.error.kind === 'not_found' || (query.error.kind === 'bad_request' && query.error.status === 400))
  return { ...query, notFound }
}

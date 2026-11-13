import { queryOptions } from '@tanstack/react-query'
import { ApiError } from '@/lib/errors'
import { getRequest, listMyRequests } from './requests.api'

/** Root key of everything about requests; a submit or a decision invalidates it. */
export const REQUESTS_KEY = ['requests'] as const
export const MY_REQUESTS_KEY = [...REQUESTS_KEY, 'my'] as const

const ID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function notFound(): ApiError {
  return new ApiError('not_found', 'Заявка не найдена', 404)
}

export function myRequestsQuery(page: number) {
  return queryOptions({
    queryKey: [...MY_REQUESTS_KEY, page],
    queryFn: () => listMyRequests(page),
    // the author must see the actual status on every opening and refresh of the section
    refetchOnMount: 'always',
    staleTime: 0
  })
}

export function requestQuery(id: string) {
  return queryOptions({
    queryKey: [...REQUESTS_KEY, 'detail', id],
    queryFn: async () => {
      if (!ID_FORMAT.test(id)) throw notFound()
      try {
        return await getRequest(id)
      } catch (error) {
        // a missing, foreign or malformed request all look the same to the user
        if (error instanceof ApiError && (error.kind === 'not_found' || error.kind === 'bad_request')) throw notFound()
        throw error
      }
    },
    refetchOnMount: 'always',
    retry: (failureCount, error) => !(error instanceof ApiError && error.kind === 'not_found') && failureCount < 2
  })
}

export function isRequestNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'not_found'
}

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { deleteDepartment } from './departments.api'
import { DEPARTMENTS_KEY } from './departments.queries'

/** Success and a 409 (the department is not empty) both reload the list: the count may have been stale. */
export function useDeleteDepartment(): UseMutationResult<void, ApiError, string> {
  const client = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: deleteDepartment,
    onSuccess: () => client.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
    onError: (error) => {
      if (error.kind === 'conflict') return client.invalidateQueries({ queryKey: DEPARTMENTS_KEY })
    }
  })
}

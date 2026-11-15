import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'

import { restoreEmployee } from './employees.api'
import type { Employee } from './employees.schema'
import { refreshEmployee } from './refresh-employee'

/** Restores a dismissed employee; success and a 409 both reload the list and the card to show the actual state. */
export function useRestoreEmployee(id: string): UseMutationResult<Employee, ApiError, void> {
  const client = useQueryClient()
  return useMutation<Employee, ApiError, void>({
    mutationFn: () => restoreEmployee(id),
    onSuccess: () => refreshEmployee(client, id),
    onError: (error) => {
      if (error.kind === 'conflict') return refreshEmployee(client, id)
    }
  })
}

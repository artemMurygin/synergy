import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import type { Role } from '@/lib/schemas'
import { replaceEmployeeRoles } from './employees.api'
import type { Employee } from './employees.schema'
import { refreshEmployee } from './refresh-employee'

/** Replaces the whole set of roles; success and a 409 both reload the list and the card to show the actual state. */
export function useReplaceRoles(id: string): UseMutationResult<Employee, ApiError, Role[]> {
  const client = useQueryClient()
  return useMutation<Employee, ApiError, Role[]>({
    mutationFn: (roles) => replaceEmployeeRoles(id, roles),
    onSuccess: () => refreshEmployee(client, id),
    onError: (error) => {
      if (error.kind === 'conflict') return refreshEmployee(client, id)
    }
  })
}

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { DEPARTMENTS_KEY } from '@/features/departments'
import type { ApiError } from '@/lib/errors'
import { employeeErrorCode } from './employees.errors'
import type { UpdateEmployeeInput } from './employees.schema'
import { updateEmployee } from './employees.api'
import type { Employee } from './employees.schema'
import { refreshEmployee } from './refresh-employee'

/** Edits the profile (absent field stays, null clears); success and a 409 both reload the list and the card to show the actual state. */
export function useUpdateEmployee(id: string): UseMutationResult<Employee, ApiError, UpdateEmployeeInput> {
  const client = useQueryClient()
  return useMutation<Employee, ApiError, UpdateEmployeeInput>({
    mutationFn: (input) => updateEmployee(id, input),
    onSuccess: () => refreshEmployee(client, id),
    onError: (error) => {
      if (error.kind === 'conflict') return refreshEmployee(client, id)
      if (employeeErrorCode(error) === 'DEPARTMENT_NOT_FOUND') return client.invalidateQueries({ queryKey: DEPARTMENTS_KEY })
    }
  })
}

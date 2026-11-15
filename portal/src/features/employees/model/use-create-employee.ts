import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { DEPARTMENTS_KEY } from '@/features/departments'
import type { ApiError } from '@/lib/errors'
import { createEmployee } from './employees.api'
import { employeeErrorCode } from './employees.errors'
import { EMPLOYEES_KEY } from './employees.queries'
import type { CreatedEmployee, CreateEmployeeInput } from './employees.schema'

/** Creates an employee. `gcTime: 0` keeps the one-time temporary password out of the cache; a deleted department reloads the directory. */
export function useCreateEmployee(): UseMutationResult<CreatedEmployee, ApiError, CreateEmployeeInput> {
  const client = useQueryClient()
  return useMutation<CreatedEmployee, ApiError, CreateEmployeeInput>({
    mutationFn: createEmployee,
    gcTime: 0,
    onSuccess: () => client.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
    onError: (error) => {
      if (employeeErrorCode(error) === 'DEPARTMENT_NOT_FOUND') return client.invalidateQueries({ queryKey: DEPARTMENTS_KEY })
    }
  })
}

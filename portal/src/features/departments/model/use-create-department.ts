import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { createDepartment } from './departments.api'
import { DEPARTMENTS_KEY } from './departments.queries'
import type { Department, DepartmentInput } from './departments.schema'

export function useCreateDepartment(): UseMutationResult<Department, ApiError, DepartmentInput> {
  const client = useQueryClient()
  return useMutation<Department, ApiError, DepartmentInput>({
    mutationFn: createDepartment,
    onSuccess: () => client.invalidateQueries({ queryKey: DEPARTMENTS_KEY })
  })
}

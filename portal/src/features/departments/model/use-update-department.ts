import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { updateDepartment } from './departments.api'
import { DEPARTMENTS_KEY } from './departments.queries'
import type { Department, DepartmentInput } from './departments.schema'

export interface UpdateDepartmentInput extends DepartmentInput {
  id: string
}

export function useUpdateDepartment(): UseMutationResult<Department, ApiError, UpdateDepartmentInput> {
  const client = useQueryClient()
  return useMutation<Department, ApiError, UpdateDepartmentInput>({
    mutationFn: ({ id, ...input }) => updateDepartment(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: DEPARTMENTS_KEY })
  })
}

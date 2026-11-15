import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { z } from 'zod'
import type { ApiError } from '@/lib/errors'
import { CATALOG_KEY, DEPARTMENTS_KEY } from '@/lib/query-keys'
import { productDepartmentsAnswerSchema, setProductDepartments } from './catalog.api'

export interface SetProductDepartmentsInput {
  productId: string
  departmentIds: string[]
}

/** Replaces the departments of a product. Success reloads the catalog; 404 (department or product gone) also reloads the departments. */
export function useSetProductDepartments(): UseMutationResult<z.infer<typeof productDepartmentsAnswerSchema>, ApiError, SetProductDepartmentsInput> {
  const client = useQueryClient()
  return useMutation<z.infer<typeof productDepartmentsAnswerSchema>, ApiError, SetProductDepartmentsInput>({
    mutationFn: ({ productId, departmentIds }) => setProductDepartments(productId, departmentIds),
    onSuccess: () => client.invalidateQueries({ queryKey: CATALOG_KEY }),
    onError: (error) => {
      if (error.status !== 404) return
      void client.invalidateQueries({ queryKey: CATALOG_KEY })
      void client.invalidateQueries({ queryKey: DEPARTMENTS_KEY })
    }
  })
}

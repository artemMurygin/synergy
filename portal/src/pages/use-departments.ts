import { useQuery } from '@tanstack/react-query'
import { departmentsQuery } from '@/features/departments'

/** The whole department directory (small, unpaged): the Departments page, the filter and the forms use it. */
export function useDepartments() {
  return useQuery(departmentsQuery())
}

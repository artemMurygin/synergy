import { useQuery } from '@tanstack/react-query'
import { departmentsQuery } from '@/features/departments'

/** The whole department directory (small, unpaged): the Departments page, the filter and the forms use it. `enabled: false` skips the request (non-admins). */
export function useDepartments(enabled = true) {
  return useQuery({ ...departmentsQuery(), enabled })
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { employeesQuery, type EmployeeFilter } from '@/features/employees'

/** One page of the employees; while the next filter or page loads the previous rows stay (`isPlaceholderData`). */
export function useEmployees(filter: EmployeeFilter) {
  return useQuery({ ...employeesQuery(filter), placeholderData: keepPreviousData })
}

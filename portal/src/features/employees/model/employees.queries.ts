import { queryOptions } from '@tanstack/react-query'
import { getEmployee, listEmployees } from './employees.api'
import type { EmployeeFilter } from './employees.schema'

export const EMPLOYEES_KEY = ['employees'] as const

/** No search, no department, every status, first page. */
export const DEFAULT_EMPLOYEE_FILTER: EmployeeFilter & { search: string } = { search: '', departmentId: undefined, status: 'all', page: 0 }

export function employeesQuery(filter: EmployeeFilter) {
  return queryOptions({
    queryKey: [...EMPLOYEES_KEY, 'list', filter.search ?? '', filter.departmentId ?? 'all', filter.status, filter.page],
    queryFn: () => listEmployees(filter),
    refetchOnMount: 'always'
  })
}

export function employeeQuery(id: string) {
  return queryOptions({
    queryKey: [...EMPLOYEES_KEY, 'card', id],
    queryFn: () => getEmployee(id),
    refetchOnMount: 'always'
  })
}

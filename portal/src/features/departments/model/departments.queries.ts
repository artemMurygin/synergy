import { queryOptions } from '@tanstack/react-query'
import { listDepartments, searchEmployees } from './departments.api'

export const DEPARTMENTS_KEY = ['departments'] as const

export function departmentsQuery() {
  return queryOptions({
    queryKey: [...DEPARTMENTS_KEY, 'list'],
    queryFn: listDepartments,
    refetchOnMount: 'always'
  })
}

export function employeeOptionsQuery(search: string) {
  return queryOptions({
    queryKey: ['department-head-options', search],
    queryFn: () => searchEmployees(search)
  })
}

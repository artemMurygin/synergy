import { queryOptions } from '@tanstack/react-query'
import { DEPARTMENTS_KEY } from '@/lib/query-keys'
import { listDepartments, searchEmployees } from './departments.api'

export { DEPARTMENTS_KEY }

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

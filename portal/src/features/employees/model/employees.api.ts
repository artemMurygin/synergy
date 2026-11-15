import { authorizedRequest } from '@/features/auth'
import type { Role } from '@/lib/schemas'
import {
  createdEmployeeSchema,
  employeeSchema,
  employeesPageSchema,
  type CreatedEmployee,
  type CreateEmployeeInput,
  type Employee,
  type EmployeeFilter,
  type EmployeesPage,
  type UpdateEmployeeInput
} from './employees.schema'

export const EMPLOYEES_PAGE_SIZE = 20

const path = (id: string) => `/admin/employees/${encodeURIComponent(id)}`

function isActiveParam(status: EmployeeFilter['status']): boolean | undefined {
  if (status === 'active') return true
  if (status === 'dismissed') return false
  return undefined
}

export function listEmployees(filter: EmployeeFilter): Promise<EmployeesPage> {
  return authorizedRequest('/admin/employees', {
    query: {
      search: filter.search ? filter.search : undefined,
      departmentId: filter.departmentId,
      isActive: isActiveParam(filter.status),
      page: filter.page,
      limit: EMPLOYEES_PAGE_SIZE
    },
    schema: employeesPageSchema
  })
}

export function getEmployee(id: string): Promise<Employee> {
  return authorizedRequest(path(id), { schema: employeeSchema })
}

export function createEmployee(input: CreateEmployeeInput): Promise<CreatedEmployee> {
  return authorizedRequest('/admin/employees', { method: 'POST', body: input, schema: createdEmployeeSchema })
}

export function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  return authorizedRequest(path(id), { method: 'PATCH', body: input, schema: employeeSchema })
}

export function replaceEmployeeRoles(id: string, roles: Role[]): Promise<Employee> {
  return authorizedRequest(`${path(id)}/roles`, { method: 'PUT', body: { roles }, schema: employeeSchema })
}

export function dismissEmployee(id: string): Promise<Employee> {
  return authorizedRequest(`${path(id)}/dismiss`, { method: 'POST', schema: employeeSchema })
}

export function restoreEmployee(id: string): Promise<Employee> {
  return authorizedRequest(`${path(id)}/restore`, { method: 'POST', schema: employeeSchema })
}

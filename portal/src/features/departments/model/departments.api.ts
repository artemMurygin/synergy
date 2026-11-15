import { authorizedRequest } from '@/features/auth'
import { departmentSchema, departmentsAnswerSchema, employeeOptionsPageSchema, type Department, type DepartmentInput, type EmployeeOption } from './departments.schema'

export const HEAD_OPTIONS_LIMIT = 10

export function listDepartments(): Promise<Department[]> {
  return authorizedRequest('/admin/departments', { schema: departmentsAnswerSchema })
}

export function createDepartment({ name, headUserId }: DepartmentInput): Promise<Department> {
  return authorizedRequest('/admin/departments', {
    method: 'POST',
    body: headUserId === null ? { name } : { name, headUserId },
    schema: departmentSchema
  })
}

/** PATCH keeps what is not sent and clears what is sent empty, so the head is always sent: null removes it. */
export function updateDepartment(id: string, { name, headUserId }: DepartmentInput): Promise<Department> {
  return authorizedRequest(`/admin/departments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { name, headUserId },
    schema: departmentSchema
  })
}

export function deleteDepartment(id: string): Promise<void> {
  return authorizedRequest(`/admin/departments/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Active employees matching the text, for the head picker. */
export async function searchEmployees(search: string): Promise<EmployeeOption[]> {
  const answer = await authorizedRequest('/admin/employees', {
    query: { search: search || undefined, limit: HEAD_OPTIONS_LIMIT, isActive: true },
    schema: employeeOptionsPageSchema
  })
  return answer.items
}

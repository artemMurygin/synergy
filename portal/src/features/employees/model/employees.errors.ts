import { ApiError } from '@/lib/errors'

export const EMPLOYEE_ERROR_CODES = [
  'LOGIN_TAKEN',
  'EMAIL_TAKEN',
  'LAST_ADMIN',
  'DEPARTMENT_NOT_FOUND',
  'EMPLOYEE_NOT_FOUND'
] as const
export type EmployeeErrorCode = (typeof EMPLOYEE_ERROR_CODES)[number]

/** The domain code of an employee API error, null for anything else (the UI shows the generic text). */
export function employeeErrorCode(error: unknown): EmployeeErrorCode | null {
  if (!(error instanceof ApiError) || error.code === null) return null
  return (EMPLOYEE_ERROR_CODES as readonly string[]).includes(error.code) ? (error.code as EmployeeErrorCode) : null
}

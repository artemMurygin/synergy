import { z } from 'zod'
import { pageSchema, roleSchema } from '@/lib/schemas'

export const employeeSchema = z.object({
  id: z.string(),
  login: z.string(),
  lastName: z.string().nullable(),
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  fullName: z.string(),
  department: z.object({ id: z.string(), name: z.string() }).nullable(),
  position: z.string().nullable(),
  email: z.string().nullable(),
  scrmEmployeeId: z.string().nullable(),
  roles: z.array(roleSchema),
  isActive: z.boolean()
})
export type Employee = z.infer<typeof employeeSchema>

export const employeesPageSchema = pageSchema(employeeSchema)
export type EmployeesPage = z.infer<typeof employeesPageSchema>

/** The one-time answer of creation: the temporary password never comes again. */
export const createdEmployeeSchema = z.object({
  employee: employeeSchema,
  temporaryPassword: z.string().min(1)
})
export type CreatedEmployee = z.infer<typeof createdEmployeeSchema>

export type EmployeeStatusFilter = 'all' | 'active' | 'dismissed'

export interface EmployeeFilter {
  search?: string
  departmentId?: string | undefined
  status: EmployeeStatusFilter
  page: number
}

export interface CreateEmployeeInput {
  login: string
  lastName: string
  firstName: string
  middleName?: string
  departmentId?: string
  position?: string
  email?: string
  scrmEmployeeId?: string
  roles?: z.infer<typeof roleSchema>[]
}

/** Absent field stays as is, null clears it. */
export interface UpdateEmployeeInput {
  lastName?: string
  firstName?: string
  middleName?: string | null
  departmentId?: string | null
  position?: string | null
  email?: string | null
  scrmEmployeeId?: string | null
}

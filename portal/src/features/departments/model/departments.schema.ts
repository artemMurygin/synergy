import { z } from 'zod'
import { pageSchema } from '@/lib/schemas'

export const DEPARTMENT_NAME_MAX = 200

export const departmentHeadSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  isActive: z.boolean()
})
export type DepartmentHead = z.infer<typeof departmentHeadSchema>

export const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  head: departmentHeadSchema.nullable(),
  employeeCount: z.number().int()
})
export type Department = z.infer<typeof departmentSchema>

// GET /admin/departments is a plain unpaged array
export const departmentsAnswerSchema = z.array(departmentSchema)

export const employeeOptionSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  department: z.object({ id: z.string(), name: z.string() }).nullable(),
  isActive: z.boolean()
})
export type EmployeeOption = z.infer<typeof employeeOptionSchema>

export const employeeOptionsPageSchema = pageSchema(employeeOptionSchema)

export interface DepartmentInput {
  name: string
  /** null: no head (create) or remove the head (edit) */
  headUserId: string | null
}

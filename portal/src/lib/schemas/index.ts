import { z } from 'zod'

export const roleSchema = z.enum(['developer', 'admin'])
export type Role = z.infer<typeof roleSchema>

export const skillStatusSchema = z.enum(['planned', 'in_dev', 'testing', 'launched'])
export type SkillStatus = z.infer<typeof skillStatusSchema>

export const requestStatusCodeSchema = z.enum(['pending', 'rejected', ...skillStatusSchema.options])
export type RequestStatusCode = z.infer<typeof requestStatusCodeSchema>

export const frequencyPeriodSchema = z.enum(['day', 'week', 'month'])
export type FrequencyPeriod = z.infer<typeof frequencyPeriodSchema>

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    limit: z.number().int(),
    page: z.number().int()
  })
}

export const requestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  frequency: z.object({ count: z.number().int(), period: frequencyPeriodSchema }),
  minutesPerRun: z.number().int(),
  peopleCount: z.number().int(),
  status: z.object({ code: requestStatusCodeSchema, label: z.string() }),
  author: z.object({ id: z.string(), login: z.string(), fullName: z.string() }),
  rejectReason: z.string().nullable(),
  skill: z.object({ id: z.string(), name: z.string(), description: z.string() }).nullable(),
  createdAt: z.string()
})
export type IdeaRequest = z.infer<typeof requestSchema>

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  product: z.object({ id: z.string(), name: z.string() })
})
export type Agent = z.infer<typeof agentSchema>

export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: skillStatusSchema,
  agent: z.object({ id: z.string(), name: z.string() }),
  requestsCount: z.number().int(),
  createdAt: z.string(),
  statusChangedAt: z.string()
})
export type Skill = z.infer<typeof skillSchema>

export const profileSchema = z.object({
  id: z.string(),
  login: z.string(),
  mustChangePassword: z.boolean(),
  roles: z.array(roleSchema),
  fullName: z.string(),
  lastName: z.string().nullable(),
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  position: z.string().nullable(),
  department: z.object({ id: z.string(), name: z.string() }).nullable()
})
export type Profile = z.infer<typeof profileSchema>

import { z } from 'zod'

export const roleSchema = z.enum(['developer', 'admin'])
export type Role = z.infer<typeof roleSchema>

export const skillStatusSchema = z.enum(['planned', 'in_dev', 'testing', 'launched', 'rework'])
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

export const productRefSchema = z.object({ id: z.string(), slug: z.string(), name: z.string() })
export type ProductRef = z.infer<typeof productRefSchema>

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  products: z.array(productRefSchema)
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
  statusChangedAt: z.string(),
  products: z.array(productRefSchema),
  nextStatuses: z.array(skillStatusSchema),
  archivedAt: z.string().nullable()
})
export type Skill = z.infer<typeof skillSchema>

export const agentStatusCodeSchema = z.enum(['working', 'in_development'])
export type AgentStatusCode = z.infer<typeof agentStatusCodeSchema>

export const catalogSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: skillStatusSchema,
  statusChangedAt: z.string(),
  nextStatuses: z.array(skillStatusSchema)
})
export type CatalogSkill = z.infer<typeof catalogSkillSchema>

export const catalogAgentSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.object({ code: agentStatusCodeSchema, label: z.string() }),
  products: z.array(productRefSchema),
  skills: z.array(catalogSkillSchema)
})
export type CatalogAgent = z.infer<typeof catalogAgentSchema>

export const catalogSchema = z.object({
  products: z.array(productRefSchema.extend({ agents: z.array(catalogAgentSchema) }))
})
export type Catalog = z.infer<typeof catalogSchema>
export type CatalogProduct = Catalog['products'][number]

export const archiveSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      products: z.array(productRefSchema),
      skillsCount: z.number().int(),
      archivedAt: z.string()
    })
  ),
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      agent: z.object({ id: z.string(), name: z.string() }),
      products: z.array(productRefSchema),
      status: skillStatusSchema,
      archivedAt: z.string()
    })
  )
})
export type Archive = z.infer<typeof archiveSchema>

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

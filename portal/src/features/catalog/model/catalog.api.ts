import { authorizedRequest } from '@/features/auth'
import { z } from 'zod'
import { agentSchema, catalogSchema, departmentRefSchema, type Agent, type Catalog } from '@/lib/schemas'

export function getCatalog(): Promise<Catalog> {
  return authorizedRequest('/portal/catalog', { schema: catalogSchema })
}

export function archiveAgent(agentId: string): Promise<Agent> {
  return authorizedRequest(`/portal/agents/${encodeURIComponent(agentId)}/archive`, { method: 'POST', schema: agentSchema })
}

export const productDepartmentsAnswerSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  departments: z.array(departmentRefSchema)
})

/** Replaces the whole department set of a product (admin). An empty array clears it. */
export function setProductDepartments(productId: string, departmentIds: string[]) {
  return authorizedRequest(`/portal/products/${encodeURIComponent(productId)}/departments`, {
    method: 'PUT',
    body: { departmentIds },
    schema: productDepartmentsAnswerSchema
  })
}

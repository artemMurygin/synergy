import type { Catalog, CatalogAgent, CatalogSkill, ProductRef, SkillStatus } from '@/lib/schemas'

/** Roadmap columns, left to right. */
export const ROADMAP_ORDER: readonly SkillStatus[] = ['planned', 'in_dev', 'testing', 'rework', 'launched']

export interface RoadmapSkill extends CatalogSkill {
  agent: { id: string; name: string }
  products: ProductRef[]
}

export interface RoadmapGroup {
  status: SkillStatus
  skills: RoadmapSkill[]
}

/** An agent by id; an agent of several products appears in each branch with the same data, the first one is returned. */
export function selectAgent(catalog: Catalog, id: string): CatalogAgent | undefined {
  for (const product of catalog.products) {
    const found = product.agents.find((a) => a.id === id)
    if (found) return found
  }
  return undefined
}

/** Skills grouped by status in roadmap order. A skill is listed once; with productId only skills of its agents are kept. */
export function groupByStatus(catalog: Catalog, productId?: string): RoadmapGroup[] {
  const groups = new Map<SkillStatus, RoadmapSkill[]>(ROADMAP_ORDER.map((s) => [s, []]))
  const seen = new Set<string>()
  for (const product of catalog.products) {
    for (const agent of product.agents) {
      if (productId && !agent.products.some((p) => p.id === productId)) continue
      for (const skill of agent.skills) {
        if (seen.has(skill.id)) continue
        seen.add(skill.id)
        groups.get(skill.status)?.push({ ...skill, agent: { id: agent.id, name: agent.name }, products: agent.products })
      }
    }
  }
  return ROADMAP_ORDER.map((status) => ({ status, skills: groups.get(status) ?? [] }))
}

import { queryOptions } from '@tanstack/react-query'
import type { SkillStatus } from '@/lib/schemas'
import { listSkills } from './skills.api'

export const SKILLS_KEY = ['skills'] as const

export function skillsQuery(filter: SkillStatus | undefined, page: number) {
  return queryOptions({
    queryKey: [...SKILLS_KEY, filter ?? 'all', page],
    queryFn: () => listSkills(filter, page),
    refetchOnMount: 'always'
  })
}

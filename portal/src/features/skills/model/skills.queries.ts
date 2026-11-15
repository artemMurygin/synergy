import { queryOptions } from '@tanstack/react-query'
import type { SkillStatus } from '@/lib/schemas'
import { SKILLS_KEY } from '@/lib/query-keys'
import { listSkills } from './skills.api'

export function skillsQuery(filter: SkillStatus | undefined, page: number) {
  return queryOptions({
    queryKey: [...SKILLS_KEY, filter ?? 'all', page],
    queryFn: () => listSkills(filter, page),
    refetchOnMount: 'always'
  })
}

import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { skillsQuery, type SkillCounts } from '@/features/skills'
import { skillStatusSchema, type SkillStatus } from '@/lib/schemas'

/** Skills filtered by status; the previous list stays on screen while a new filter loads. */
export function useSkills(filter: SkillStatus | undefined, page: number) {
  return useQuery({ ...skillsQuery(filter, page), placeholderData: keepPreviousData })
}

/** Totals for the status chips and summary tiles: the total of each status-filtered first page (and of the unfiltered one). */
export function useSkillCounts(): SkillCounts | undefined {
  const results = useQueries({ queries: [undefined, ...skillStatusSchema.options].map((s) => skillsQuery(s, 0)) })
  if (results.some((r) => !r.data)) return undefined
  const [all, ...rest] = results.map((r) => r.data?.total ?? 0)
  return {
    total: all ?? 0,
    byStatus: Object.fromEntries(skillStatusSchema.options.map((s, i) => [s, rest[i] ?? 0])) as Record<SkillStatus, number>
  }
}

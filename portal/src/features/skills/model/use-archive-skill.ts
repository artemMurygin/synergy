import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import type { Skill } from '@/lib/schemas'
import { SKILLS_KEY } from '@/lib/query-keys'
import { archiveSkill } from './skills.api'
import type { SkillsPage } from './skills.api'
import { reloadSkillViews } from './use-change-skill-status'

/** Archives a skill: it leaves the cached lists at once, then skills, catalog and archive are reloaded. */
export function useArchiveSkill(): UseMutationResult<Skill, ApiError, string> {
  const client = useQueryClient()
  return useMutation<Skill, ApiError, string>({
    mutationFn: archiveSkill,
    onSuccess: (archived) => {
      client.setQueriesData<SkillsPage>({ queryKey: SKILLS_KEY }, (page) =>
        page ? { ...page, items: page.items.filter((s) => s.id !== archived.id), total: Math.max(0, page.total - 1) } : page
      )
      return reloadSkillViews(client)
    }
  })
}

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { ApiError } from '@/lib/errors'
import type { Skill, SkillStatus } from '@/lib/schemas'
import { changeSkillStatus } from './skills.api'
import { SKILLS_KEY } from './skills.queries'

export const SKILL_CONFLICT_MESSAGE = 'Статус навыка уже изменён. Показано актуальное состояние.'

export function skillErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.kind === 'conflict' ? SKILL_CONFLICT_MESSAGE : error.message
  return 'Не удалось изменить статус'
}

export interface ChangeSkillStatusInput {
  skillId: string
  to: SkillStatus
}

/** Moves a skill to the next status; success and a 409 both reload the lists to show the actual state. */
export function useChangeSkillStatus(): UseMutationResult<Skill, ApiError, ChangeSkillStatusInput> {
  const client = useQueryClient()
  return useMutation<Skill, ApiError, ChangeSkillStatusInput>({
    mutationFn: ({ skillId, to }) => changeSkillStatus(skillId, to),
    onSuccess: () => client.invalidateQueries({ queryKey: SKILLS_KEY }),
    onError: (error) => {
      if (error.kind === 'conflict') return client.invalidateQueries({ queryKey: SKILLS_KEY })
    }
  })
}

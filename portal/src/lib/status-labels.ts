import type { RequestStatusCode, SkillStatus } from './schemas'

/** The single Russian dictionary of request and skill statuses on the portal. */
export const REQUEST_STATUS_LABEL: Record<RequestStatusCode, string> = {
  pending: 'На рассмотрении',
  rejected: 'Отклонена',
  planned: 'Запланировано',
  in_dev: 'В разработке',
  testing: 'Тестируется',
  launched: 'Запущено'
}

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  planned: 'Запланировано',
  in_dev: 'В разработке',
  testing: 'Тестируется',
  launched: 'Запущено'
}

export const SKILL_STATUS_FLOW: readonly SkillStatus[] = ['planned', 'in_dev', 'testing', 'launched']

/** The only status a skill can move to, or null for the final one. */
export function nextSkillStatus(status: SkillStatus): SkillStatus | null {
  return SKILL_STATUS_FLOW[SKILL_STATUS_FLOW.indexOf(status) + 1] ?? null
}

import type { AgentStatusCode, RequestStatusCode, SkillStatus } from './schemas'

/** The single Russian dictionary of request and skill statuses on the portal. */
export const REQUEST_STATUS_LABEL: Record<RequestStatusCode, string> = {
  pending: 'На рассмотрении',
  rejected: 'Отклонена',
  planned: 'Запланировано',
  in_dev: 'В разработке',
  testing: 'Тестируется',
  launched: 'Запущено',
  rework: 'Доработка'
}

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  planned: 'Запланировано',
  in_dev: 'В разработке',
  testing: 'Тестируется',
  launched: 'Запущено',
  rework: 'Доработка'
}

export const AGENT_STATUS_LABEL: Record<AgentStatusCode, string> = {
  working: 'Работает',
  in_development: 'В разработке'
}

/* Badge colours: background, label and the (separately coloured) dot, shared by skills and catalog. */
export const SKILL_BADGE_CLASS: Record<SkillStatus, string> = {
  planned: 'bg-surface-sunken text-ink-80 [&>span:first-child]:bg-info',
  in_dev: 'bg-info-soft text-info [&>span:first-child]:bg-info',
  testing: 'bg-info-soft text-info [&>span:first-child]:bg-warning',
  launched: 'bg-success-soft text-success [&>span:first-child]:bg-success',
  rework: 'bg-warning-soft text-ink-80 [&>span:first-child]:bg-warning'
}

export const AGENT_BADGE_CLASS: Record<AgentStatusCode, string> = {
  working: 'bg-success-soft text-success [&>span:first-child]:bg-success',
  in_development: 'bg-info-soft text-info [&>span:first-child]:bg-info'
}

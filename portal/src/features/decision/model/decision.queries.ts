import { queryOptions } from '@tanstack/react-query'
import { ApiError } from '@/lib/errors'
import { listQueue } from './decision.api'

export const QUEUE_KEY = ['queue'] as const

export const DECISION_CONFLICT_MESSAGE = 'Решение по заявке уже принято. Очередь обновлена.'

export const SKILL_ARCHIVED_MESSAGE = 'Навык в архиве. Заявка осталась на рассмотрении: верните навык из архива или выберите другой.'
export const AGENT_ARCHIVED_MESSAGE = 'Агент этого навыка в архиве. Заявка осталась на рассмотрении: верните агента из архива или выберите другого.'

export function queueQuery(page: number) {
  return queryOptions({
    queryKey: [...QUEUE_KEY, page],
    queryFn: () => listQueue(page),
    refetchOnMount: 'always'
  })
}

export function decisionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'PORTAL_SKILL_ARCHIVED') return SKILL_ARCHIVED_MESSAGE
  if (error instanceof ApiError && error.code === 'PORTAL_AGENT_ARCHIVED') return AGENT_ARCHIVED_MESSAGE
  if (error instanceof ApiError) return error.kind === 'conflict' ? DECISION_CONFLICT_MESSAGE : error.message
  return 'Не удалось сохранить решение'
}

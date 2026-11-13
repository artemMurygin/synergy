import { queryOptions } from '@tanstack/react-query'
import { ApiError } from '@/lib/errors'
import { listQueue } from './decision.api'

export const QUEUE_KEY = ['queue'] as const

export const DECISION_CONFLICT_MESSAGE = 'Решение по заявке уже принято. Очередь обновлена.'

export function queueQuery(page: number) {
  return queryOptions({
    queryKey: [...QUEUE_KEY, page],
    queryFn: () => listQueue(page),
    refetchOnMount: 'always'
  })
}

export function decisionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.kind === 'conflict' ? DECISION_CONFLICT_MESSAGE : error.message
  return 'Не удалось сохранить решение'
}

import { queryOptions } from '@tanstack/react-query'
import { ApiError } from '@/lib/errors'
import { listQueue } from './decision.api'

export const QUEUE_KEY = ['queue'] as const

export const DECISION_CONFLICT_MESSAGE = 'Решение по заявке уже принято. Очередь обновлена.'

export const SKILL_ARCHIVED_MESSAGE = 'Навык в архиве. Заявка осталась на рассмотрении: верните навык из архива или выберите другой.'
export const AGENT_ARCHIVED_MESSAGE = 'Агент этого навыка в архиве. Заявка осталась на рассмотрении: верните агента из архива или выберите другого.'

export const REQUEST_ALREADY_TAKEN_MESSAGE = 'Заявку уже взял другой разработчик. Данные обновлены.'
export const REQUEST_NOT_TAKEN_MESSAGE = 'Сначала возьмите заявку в работу.'
export const AGENT_NAME_TAKEN_MESSAGE = 'Агент с таким названием уже есть'
export const PRODUCT_NAME_TAKEN_MESSAGE = 'Продукт с таким названием уже есть'
export const PRODUCT_NOT_FOUND_MESSAGE = 'Продукт не найден. Обновите страницу и выберите продукт заново.'

export function queueQuery(page: number) {
  return queryOptions({
    queryKey: [...QUEUE_KEY, page],
    queryFn: () => listQueue(page),
    refetchOnMount: 'always'
  })
}

const MESSAGE_BY_CODE: Record<string, string> = {
  PORTAL_REQUEST_ALREADY_TAKEN: REQUEST_ALREADY_TAKEN_MESSAGE,
  PORTAL_REQUEST_NOT_TAKEN: REQUEST_NOT_TAKEN_MESSAGE,
  PORTAL_REQUEST_ALREADY_DECIDED: DECISION_CONFLICT_MESSAGE,
  PORTAL_SKILL_ARCHIVED: SKILL_ARCHIVED_MESSAGE,
  PORTAL_AGENT_ARCHIVED: AGENT_ARCHIVED_MESSAGE,
  PORTAL_AGENT_NAME_TAKEN: AGENT_NAME_TAKEN_MESSAGE,
  PORTAL_PRODUCT_NAME_TAKEN: PRODUCT_NAME_TAKEN_MESSAGE,
  PORTAL_PRODUCT_NOT_FOUND: PRODUCT_NOT_FOUND_MESSAGE
}

/** The text is chosen by the `code` of the error body, never by the server message. */
export function decisionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const byCode = error.code === null ? undefined : MESSAGE_BY_CODE[error.code]
    if (byCode) return byCode
    return error.kind === 'conflict' ? DECISION_CONFLICT_MESSAGE : error.message
  }
  return 'Не удалось сохранить решение'
}

import { ApiError } from '@/lib/errors'

export const BUG_INVALID_TRANSITION_MESSAGE = 'Статус бага уже изменился'
export const BUG_AGENT_ARCHIVED_MESSAGE = 'Агент больше недоступен'
export const BUG_AGENT_NOT_IN_PRODUCT_MESSAGE = 'Агент не входит в выбранный продукт'
export const BUG_NOT_FOUND_MESSAGE = 'Обращение не найдено'
export const BUG_ERROR_FALLBACK = 'Не удалось выполнить действие. Попробуйте ещё раз.'

const MESSAGE_BY_CODE: Record<string, string> = {
  PORTAL_BUG_INVALID_TRANSITION: BUG_INVALID_TRANSITION_MESSAGE,
  PORTAL_AGENT_ARCHIVED: BUG_AGENT_ARCHIVED_MESSAGE,
  PORTAL_AGENT_NOT_IN_PRODUCT: BUG_AGENT_NOT_IN_PRODUCT_MESSAGE,
  PORTAL_BUG_NOT_FOUND: BUG_NOT_FOUND_MESSAGE
}

/** The text is chosen by the `code` of the error body, never by the server message. */
export function bugErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code !== null) {
    const byCode = MESSAGE_BY_CODE[error.code]
    if (byCode) return byCode
  }
  return BUG_ERROR_FALLBACK
}

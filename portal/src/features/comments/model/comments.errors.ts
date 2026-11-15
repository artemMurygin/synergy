import { ApiError } from '@/lib/errors'

export const COMMENT_EDIT_EXPIRED_MESSAGE = 'Изменить комментарий уже нельзя: прошло больше 15 минут'
export const COMMENT_NOT_OWNED_MESSAGE = 'Редактировать можно только свой комментарий'
export const COMMENT_INVALID_MESSAGE = 'Комментарий должен содержать от 1 до 4000 символов'
export const COMMENT_ERROR_FALLBACK = 'Не удалось сохранить комментарий. Попробуйте ещё раз.'

const MESSAGE_BY_CODE: Record<string, string> = {
  PORTAL_COMMENT_EDIT_EXPIRED: COMMENT_EDIT_EXPIRED_MESSAGE,
  PORTAL_COMMENT_NOT_OWNED: COMMENT_NOT_OWNED_MESSAGE
}

/** The text is chosen by the `code` of the error body (then the status), never by the server message. */
export function commentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const byCode = error.code === null ? undefined : MESSAGE_BY_CODE[error.code]
    if (byCode) return byCode
    if (error.kind === 'bad_request') return COMMENT_INVALID_MESSAGE
  }
  return COMMENT_ERROR_FALLBACK
}

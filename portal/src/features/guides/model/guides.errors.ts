import { ApiError } from '@/lib/errors'

export const GUIDE_ARCHIVED_MESSAGE = 'Агент в архиве'
export const GUIDE_TOO_LONG_MESSAGE = 'Инструкция слишком длинная: не более 50 000 символов'
export const GUIDE_NETWORK_MESSAGE = 'Сервер недоступен. Текст сохранён в редакторе, повторите попытку.'
export const GUIDE_ERROR_FALLBACK = 'Не удалось сохранить инструкцию. Попробуйте ещё раз.'

/** The text is chosen by the kind/code of the error, never by the server message. */
export function guideErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'conflict') return GUIDE_ARCHIVED_MESSAGE
    if (error.kind === 'bad_request') return GUIDE_TOO_LONG_MESSAGE
    if (error.kind === 'unavailable') return GUIDE_NETWORK_MESSAGE
  }
  return GUIDE_ERROR_FALLBACK
}

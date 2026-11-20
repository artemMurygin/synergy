import { isNetworkError } from '@synergy/ui-kit'

export const UNREACHABLE_MESSAGE =
  'Не удалось связаться с сервером. Проверьте адрес бэкенда в настройках расширения.'

/** The run failed because the server was not reached: the raw network error or the text `createAgent` made of it. */
export function isUnreachable(error: unknown): boolean {
  if (isNetworkError(error)) return true
  return error instanceof Error && error.message === UNREACHABLE_MESSAGE
}

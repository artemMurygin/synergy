import type { AuthErrorCode } from './auth.api'

interface LoginFailure {
  code: AuthErrorCode
  retryAfterSec?: number
}

const rateLimited = (retryAfterSec?: number): string =>
  retryAfterSec && retryAfterSec > 0
    ? `Слишком много попыток входа. Повторите через ${String(Math.ceil(retryAfterSec))} с.`
    : 'Слишком много попыток входа. Повторите позже.'

export function loginErrorText(error: LoginFailure | null, snapshotRetryAfterSec?: number, warning?: string): string | undefined {
  if (error) {
    if (error.code === 'INVALID_CREDENTIALS') return 'Неверный логин или пароль'
    if (error.code === 'RATE_LIMITED') return rateLimited(error.retryAfterSec ?? snapshotRetryAfterSec)
    return 'Не удалось выполнить вход. Попробуйте ещё раз немного позже.'
  }
  if (snapshotRetryAfterSec && snapshotRetryAfterSec > 0) return rateLimited(snapshotRetryAfterSec)
  if (warning) return `Выход выполнен только на этом компьютере. ${warning}`
  return undefined
}

export function changePasswordErrorText(
  error: { code: AuthErrorCode } | null,
  kind: 'forced' | 'voluntary' = 'voluntary'
): string | undefined {
  if (!error) return undefined
  switch (error.code) {
    case 'WRONG_PASSWORD':
      return 'Неверный текущий пароль'
    case 'SAME_PASSWORD':
    case 'PASSWORD_UNCHANGED':
      return kind === 'forced'
        ? 'Новый пароль не должен совпадать с временным'
        : 'Новый пароль должен отличаться от текущего'
    case 'WEAK_PASSWORD':
      return 'Пароль слишком простой'
    default:
      return 'Не удалось сменить пароль. Попробуйте ещё раз.'
  }
}

import { SamePasswordError, WeakPasswordError, WrongPasswordError } from '../auth-api'

const VIOLATION_TEXT: Record<string, string> = {
  'too-short': 'Пароль короче 10 символов',
  'no-letter': 'Добавьте хотя бы одну букву',
  'no-digit': 'Добавьте хотя бы одну цифру',
  'same-as-login': 'Пароль не должен совпадать с логином',
  'same-as-current': 'Новый пароль не должен совпадать с текущим',
}

/** Text of a failed password change for the package dialog (it shows a single error line). */
export function passwordErrorText(error: unknown, kind: 'forced' | 'voluntary'): string {
  if (error instanceof WeakPasswordError) {
    return error.violations.map((code) => VIOLATION_TEXT[code] ?? code).join('. ')
  }
  if (error instanceof WrongPasswordError) {
    return kind === 'forced' ? 'Неверный временный пароль' : 'Неверный текущий пароль'
  }
  if (error instanceof SamePasswordError) {
    return kind === 'forced'
      ? 'Новый пароль не должен совпадать с временным'
      : 'Новый пароль не должен совпадать с текущим'
  }
  return 'Не удалось сменить пароль. Повторите попытку позже.'
}

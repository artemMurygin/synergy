import { ApiError } from '@/lib/errors'
import { employeeErrorCode } from './employees.errors'

export const LOGIN_TAKEN_MESSAGE = 'Этот логин уже занят'
export const EMAIL_TAKEN_MESSAGE = 'Этот email уже у другого сотрудника'
export const DEPARTMENT_GONE_MESSAGE = 'Отдел удалён. Выберите другой'
export const LAST_ADMIN_TITLE = 'Нельзя оставить систему без администратора'
export const LAST_ADMIN_TEXT = 'Сначала выдайте роль «Администратор» другому активному сотруднику'

export interface EmployeeFormFieldErrors {
  login?: string
  email?: string
  departmentId?: string
  general?: string
}

/** Maps a failed create or edit to the field that shows it; anything unknown becomes one general text. */
export function employeeFormErrors(error: unknown, mode: 'create' | 'edit'): EmployeeFormFieldErrors {
  if (!error) return {}
  switch (employeeErrorCode(error)) {
    case 'LOGIN_TAKEN':
      return { login: LOGIN_TAKEN_MESSAGE }
    case 'EMAIL_TAKEN':
      return { email: EMAIL_TAKEN_MESSAGE }
    case 'DEPARTMENT_NOT_FOUND':
      return { departmentId: DEPARTMENT_GONE_MESSAGE }
    default:
      break
  }
  if (error instanceof ApiError && error.kind === 'bad_request') return { general: error.message }
  return {
    general: mode === 'create' ? 'Не удалось создать сотрудника. Проверьте соединение и попробуйте ещё раз' : 'Не удалось сохранить изменения'
  }
}

import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/errors'
import { employeeFormErrors, LAST_ADMIN_TITLE, LAST_ADMIN_TEXT } from './employee-form-errors'

const conflict = (code: string) => new ApiError('conflict', 'x', 409, code)

describe('employeeFormErrors', () => {
  it('is empty without an error', () => {
    expect(employeeFormErrors(null, 'create')).toEqual({})
  })

  it('409 LOGIN_TAKEN goes to the login', () => {
    expect(employeeFormErrors(conflict('LOGIN_TAKEN'), 'create')).toEqual({ login: 'Этот логин уже занят' })
  })

  it('409 EMAIL_TAKEN goes to the email', () => {
    expect(employeeFormErrors(conflict('EMAIL_TAKEN'), 'edit')).toEqual({ email: 'Этот email уже у другого сотрудника' })
  })

  it('404 DEPARTMENT_NOT_FOUND goes to the department', () => {
    expect(employeeFormErrors(new ApiError('not_found', 'x', 404, 'DEPARTMENT_NOT_FOUND'), 'create')).toEqual({
      departmentId: 'Отдел удалён. Выберите другой'
    })
  })

  it('anything else is a general message of the mode, not the server text', () => {
    expect(employeeFormErrors(new ApiError('unavailable', 'Сервер недоступен'), 'create')).toEqual({
      general: 'Не удалось создать сотрудника. Проверьте соединение и попробуйте ещё раз'
    })
    expect(employeeFormErrors(new Error('boom'), 'edit')).toEqual({ general: 'Не удалось сохранить изменения' })
  })

  it('a 400 keeps the text the server gave', () => {
    expect(employeeFormErrors(new ApiError('bad_request', 'Логин содержит пробелы', 400), 'create')).toEqual({ general: 'Логин содержит пробелы' })
  })

  it('exports the LAST_ADMIN texts', () => {
    expect(LAST_ADMIN_TITLE).toBe('Нельзя оставить систему без администратора')
    expect(LAST_ADMIN_TEXT).toBe('Сначала выдайте роль «Администратор» другому активному сотруднику')
  })
})

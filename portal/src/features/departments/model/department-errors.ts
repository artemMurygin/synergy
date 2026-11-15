import { ApiError } from '@/lib/errors'

export const DEPARTMENT_NAME_TAKEN_MESSAGE = 'Отдел с таким названием уже есть'
export const HEAD_NOT_FOUND_MESSAGE = 'Сотрудник не найден, выберите другого'

export interface DepartmentFormErrors {
  name?: string
  head?: string
  general?: string
}

/** Maps a failed create/update to the field that shows it. */
export function departmentFormErrors(error: unknown): DepartmentFormErrors {
  if (!error) return {}
  if (error instanceof ApiError) {
    if (error.code === 'DEPARTMENT_NAME_TAKEN') return { name: DEPARTMENT_NAME_TAKEN_MESSAGE }
    if (error.kind === 'not_found' && error.code !== 'DEPARTMENT_NOT_FOUND') return { head: HEAD_NOT_FOUND_MESSAGE }
    return { general: error.message }
  }
  return { general: 'Не удалось сохранить отдел' }
}

export function departmentDeleteErrorMessage(error: unknown, departmentName: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'DEPARTMENT_NOT_EMPTY') {
      return `Отдел «${departmentName}» не пуст. В нём есть сотрудники, в том числе, возможно, уволенные. Переведите их в другой отдел и повторите`
    }
    return error.message
  }
  return 'Не удалось удалить отдел'
}

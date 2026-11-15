import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { ApiError } from '@/lib/errors'
import { createTestClient, json, page, queryWrapper, stubFetch } from '@/test/helpers'
import { departmentsQuery, employeeOptionsQuery } from './departments.queries'
import { departmentDeleteErrorMessage, departmentFormErrors } from './department-errors'
import { departmentFixture, departmentWithoutHead, employeeOptionFixtures } from './fixtures'
import { useCreateDepartment } from './use-create-department'
import { useDeleteDepartment } from './use-delete-department'
import { useUpdateDepartment } from './use-update-department'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'a1', login: 'admin', mustChangePassword: false, roles: ['admin'], fullName: 'admin', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('departmentsQuery', () => {
  it('loads the whole directory', async () => {
    stubFetch(() => json([departmentFixture]))
    expect(await createTestClient().fetchQuery(departmentsQuery())).toEqual([departmentFixture])
  })

  it('is keyed under departments so the mutations can invalidate it', () => {
    expect(departmentsQuery().queryKey[0]).toBe('departments')
  })
})

describe('employeeOptionsQuery', () => {
  it('keys differ by search text', () => {
    expect(employeeOptionsQuery('а').queryKey).not.toEqual(employeeOptionsQuery('б').queryKey)
  })

  it('loads matching employees', async () => {
    stubFetch(() => json(page(employeeOptionFixtures)))
    const items = await createTestClient().fetchQuery(employeeOptionsQuery('п'))
    expect(items).toHaveLength(3)
  })
})

describe('department mutations', () => {
  it('useCreateDepartment returns the new department and invalidates the list', async () => {
    stubFetch(() => json(departmentWithoutHead, 201))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateDepartment(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync({ name: 'Разработка', headUserId: null })
    })
    await waitFor(() => expect(result.current.data?.id).toBe('d-dev'))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['departments'] }))
  })

  it('useUpdateDepartment invalidates the list', async () => {
    stubFetch(() => json(departmentFixture))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateDepartment(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync({ id: 'd-sales', name: 'Продажи', headUserId: 'u-petrova' })
    })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['departments'] }))
  })

  it('useDeleteDepartment invalidates the list on success', async () => {
    stubFetch(() => new Response(null, { status: 204 }))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteDepartment(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync('d-law')
    })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['departments'] }))
  })

  it('useDeleteDepartment on 409 keeps the error and still reloads the list (the row stays)', async () => {
    stubFetch(() => json({ message: 'not empty', code: 'DEPARTMENT_NOT_EMPTY' }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteDepartment(), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate('d-sales'))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ code: 'DEPARTMENT_NOT_EMPTY' })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['departments'] }))
  })

  it('a failed create does not reload the list', async () => {
    stubFetch(() => json({ message: 'taken', code: 'DEPARTMENT_NAME_TAKEN' }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateDepartment(), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate({ name: 'Продажи', headUserId: null }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('departmentFormErrors', () => {
  it('puts DEPARTMENT_NAME_TAKEN at the name field', () => {
    const error = new ApiError('conflict', 'taken', 409, 'DEPARTMENT_NAME_TAKEN')
    expect(departmentFormErrors(error)).toEqual({ name: 'Отдел с таким названием уже есть' })
  })

  it('puts a 404 on the employee at the head field', () => {
    const error = new ApiError('not_found', 'gone', 404, 'EMPLOYEE_NOT_FOUND')
    expect(departmentFormErrors(error)).toEqual({ head: 'Сотрудник не найден, выберите другого' })
  })

  it('puts anything else into a general message', () => {
    const error = new ApiError('unavailable', 'Сервер недоступен')
    expect(departmentFormErrors(error)).toEqual({ general: 'Сервер недоступен' })
  })

  it('has no errors without an error', () => {
    expect(departmentFormErrors(null)).toEqual({})
  })
})

describe('departmentDeleteErrorMessage', () => {
  it('explains that the department is not empty', () => {
    const error = new ApiError('conflict', 'x', 409, 'DEPARTMENT_NOT_EMPTY')
    expect(departmentDeleteErrorMessage(error, 'Маркетинг')).toBe(
      'Отдел «Маркетинг» не пуст. В нём есть сотрудники, в том числе, возможно, уволенные. Переведите их в другой отдел и повторите'
    )
  })

  it('shows the server message for other errors', () => {
    expect(departmentDeleteErrorMessage(new ApiError('unavailable', 'Сервер недоступен'), 'Маркетинг')).toBe('Сервер недоступен')
  })
})

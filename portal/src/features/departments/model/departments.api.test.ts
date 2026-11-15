import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, page, stubFetch } from '@/test/helpers'
import { createDepartment, deleteDepartment, listDepartments, searchEmployees, updateDepartment } from './departments.api'
import { departmentDismissedHead, departmentFixture, departmentWithoutHead, employeeOptionFixtures } from './fixtures'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'a1', login: 'admin', mustChangePassword: false, roles: ['admin'], fullName: 'admin', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('departments.api', () => {
  it('listDepartments reads a plain array', async () => {
    const { calls } = stubFetch(() => json([departmentFixture, departmentWithoutHead, departmentDismissedHead]))
    const items = await listDepartments()
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/admin/departments' })
    expect(items).toHaveLength(3)
    expect(items[1]?.head).toBeNull()
    expect(items[2]?.head).toEqual({ id: 'u-pavlov', fullName: 'Павлов Артём Игоревич', isActive: false })
  })

  it('listDepartments rejects a paged answer: the contract is a plain array', async () => {
    stubFetch(() => json(page([departmentFixture])))
    await expect(listDepartments()).rejects.toBeDefined()
  })

  it('listDepartments rejects an answer of the wrong shape', async () => {
    stubFetch(() => json([{ id: 'x', name: 'Без числа сотрудников' }]))
    await expect(listDepartments()).rejects.toMatchObject({ kind: 'unexpected' })
  })

  it('createDepartment posts the name and the head', async () => {
    const { calls } = stubFetch(() => json(departmentFixture, 201))
    const created = await createDepartment({ name: 'Продажи', headUserId: 'u-petrova' })
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/admin/departments', body: { name: 'Продажи', headUserId: 'u-petrova' } })
    expect(created.id).toBe('d-sales')
  })

  it('createDepartment omits the head when none is chosen', async () => {
    const { calls } = stubFetch(() => json(departmentWithoutHead, 201))
    await createDepartment({ name: 'Разработка', headUserId: null })
    expect(calls[0]?.body).toEqual({ name: 'Разработка' })
  })

  it('updateDepartment patches with an explicit null to clear the head', async () => {
    const { calls } = stubFetch(() => json(departmentWithoutHead))
    await updateDepartment('d-dev', { name: 'Разработка', headUserId: null })
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/admin/departments/d-dev', body: { name: 'Разработка', headUserId: null } })
  })

  it('deleteDepartment sends DELETE and accepts an empty answer', async () => {
    const { calls } = stubFetch(() => new Response(null, { status: 204 }))
    await expect(deleteDepartment('d-law')).resolves.toBeUndefined()
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/admin/departments/d-law' })
  })

  it('keeps the error code of a 409 on the name', async () => {
    stubFetch(() => json({ message: 'taken', code: 'DEPARTMENT_NAME_TAKEN' }, 409))
    await expect(createDepartment({ name: 'Продажи', headUserId: null })).rejects.toMatchObject({ kind: 'conflict', code: 'DEPARTMENT_NAME_TAKEN' })
  })

  it('keeps the error code of a 409 on a non-empty department', async () => {
    stubFetch(() => json({ message: 'not empty', code: 'DEPARTMENT_NOT_EMPTY' }, 409))
    await expect(deleteDepartment('d-sales')).rejects.toMatchObject({ kind: 'conflict', code: 'DEPARTMENT_NOT_EMPTY' })
  })

  it('keeps the 404 of a vanished head', async () => {
    stubFetch(() => json({ message: 'no employee', code: 'EMPLOYEE_NOT_FOUND' }, 404))
    await expect(updateDepartment('d-sales', { name: 'Продажи', headUserId: 'gone' })).rejects.toMatchObject({ kind: 'not_found', code: 'EMPLOYEE_NOT_FOUND' })
  })

  it('searchEmployees asks for at most 10 active employees matching the text', async () => {
    const { calls } = stubFetch(() => json(page(employeeOptionFixtures)))
    const items = await searchEmployees('пр')
    const params = new URLSearchParams(calls[0]?.search)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/admin/employees' })
    expect(params.get('search')).toBe('пр')
    expect(params.get('limit')).toBe('10')
    expect(params.get('isActive')).toBe('true')
    expect(params.has('dismissed')).toBe(false)
    expect(items).toHaveLength(3)
  })

  it('searchEmployees sends no search for an empty text', async () => {
    const { calls } = stubFetch(() => json(page([])))
    await searchEmployees('')
    expect(new URLSearchParams(calls[0]?.search).has('search')).toBe(false)
  })
})

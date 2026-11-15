import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, page, stubFetch } from '@/test/helpers'
import {
  createEmployee,
  dismissEmployee,
  getEmployee,
  listEmployees,
  replaceEmployeeRoles,
  restoreEmployee,
  updateEmployee
} from './employees.api'
import { employeeErrorCode } from './employees.errors'
import { employeeFixture } from './employees.fixtures'
import { employeeSchema } from './employees.schema'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'adm', mustChangePassword: false, roles: ['admin'], fullName: 'adm', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('employeeSchema', () => {
  it('accepts a card and a card without profile fields', () => {
    expect(employeeSchema.parse(employeeFixture)).toEqual(employeeFixture)
    const bare = { ...employeeFixture, lastName: null, firstName: null, middleName: null, department: null, position: null, email: null, scrmEmployeeId: null, roles: [] }
    expect(employeeSchema.parse(bare).department).toBeNull()
  })

  it('rejects an unknown role', () => {
    expect(employeeSchema.safeParse({ ...employeeFixture, roles: ['boss'] }).success).toBe(false)
  })
})

describe('employees.api', () => {
  it('listEmployees sends search, department, isActive, page and limit and parses the page', async () => {
    const { calls } = stubFetch(() => json(page([employeeFixture])))
    const result = await listEmployees({ search: 'иван', departmentId: 'd1', status: 'dismissed', page: 2 })
    const params = new URLSearchParams(calls[0]?.search)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/admin/employees' })
    expect(params.get('search')).toBe('иван')
    expect(params.get('departmentId')).toBe('d1')
    expect(params.get('isActive')).toBe('false')
    expect(params.get('page')).toBe('2')
    expect(params.has('limit')).toBe(true)
    expect(result.items[0]?.fullName).toBe('Иванов Иван Петрович')
  })

  it('listEmployees with status all and empty search sends no filters', async () => {
    const { calls } = stubFetch(() => json(page([])))
    await listEmployees({ search: '', departmentId: undefined, status: 'all', page: 0 })
    const params = new URLSearchParams(calls[0]?.search)
    expect(params.has('isActive')).toBe(false)
    expect(params.has('search')).toBe(false)
    expect(params.has('departmentId')).toBe(false)
  })

  it('listEmployees maps status active to isActive=true', async () => {
    const { calls } = stubFetch(() => json(page([])))
    await listEmployees({ status: 'active', page: 0 })
    expect(new URLSearchParams(calls[0]?.search).get('isActive')).toBe('true')
  })

  it('getEmployee loads the card by id', async () => {
    const { calls } = stubFetch(() => json(employeeFixture))
    expect((await getEmployee('e1')).login).toBe('ivanov')
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/admin/employees/e1' })
  })

  it('createEmployee posts the profile and returns the employee with the temporary password', async () => {
    const { calls } = stubFetch(() => json({ employee: employeeFixture, temporaryPassword: 'Tmp-pass-1' }, 201))
    const input = { login: 'ivanov', lastName: 'Иванов', firstName: 'Иван', roles: ['developer' as const] }
    const result = await createEmployee(input)
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/admin/employees', body: input })
    expect(result.temporaryPassword).toBe('Tmp-pass-1')
    expect(result.employee.id).toBe('e1')
  })

  it('createEmployee rejects an answer without the temporary password', async () => {
    stubFetch(() => json({ employee: employeeFixture }, 201))
    await expect(createEmployee({ login: 'a', lastName: 'b', firstName: 'c' })).rejects.toMatchObject({ kind: 'unexpected' })
  })

  it('updateEmployee patches only the given fields, null clears', async () => {
    const { calls } = stubFetch(() => json(employeeFixture))
    await updateEmployee('e1', { position: null, email: 'a@b.co' })
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/admin/employees/e1', body: { position: null, email: 'a@b.co' } })
  })

  it('replaceEmployeeRoles puts the full set', async () => {
    const { calls } = stubFetch(() => json({ ...employeeFixture, roles: ['admin'] }))
    const result = await replaceEmployeeRoles('e1', ['admin'])
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/admin/employees/e1/roles', body: { roles: ['admin'] } })
    expect(result.roles).toEqual(['admin'])
  })

  it('dismissEmployee and restoreEmployee post to their endpoints', async () => {
    const { calls } = stubFetch((call) => json({ ...employeeFixture, isActive: call.path.endsWith('restore') }))
    expect((await dismissEmployee('e1')).isActive).toBe(false)
    expect((await restoreEmployee('e1')).isActive).toBe(true)
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/admin/employees/e1/dismiss' })
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/admin/employees/e1/restore' })
  })

  it.each([
    [409, 'LOGIN_TAKEN'],
    [409, 'EMAIL_TAKEN'],
    [409, 'LAST_ADMIN'],
    [404, 'DEPARTMENT_NOT_FOUND'],
    [404, 'EMPLOYEE_NOT_FOUND']
  ])('error %i %s is exposed as ApiError with that code', async (status, code) => {
    stubFetch(() => json({ message: 'x', code }, status))
    const error = await updateEmployee('e1', {}).catch((e: unknown) => e)
    expect(error).toMatchObject({ status, code })
    expect(employeeErrorCode(error)).toBe(code)
  })

  it('a plain 404 without a code is not_found', async () => {
    stubFetch(() => json({ message: 'nope' }, 404))
    const error = await getEmployee('zzz').catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'not_found', status: 404 })
    expect(employeeErrorCode(error)).toBeNull()
  })

  it('employeeErrorCode ignores unknown codes and non-API errors', () => {
    expect(employeeErrorCode(new Error('x'))).toBeNull()
    expect(employeeErrorCode(undefined)).toBeNull()
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { DEPARTMENTS_KEY } from '@/features/departments'
import { createTestClient, json, page, queryWrapper, stubFetch } from '@/test/helpers'
import { employeeFixture } from './employees.fixtures'
import { employeeQuery, employeesQuery, EMPLOYEES_KEY, DEFAULT_EMPLOYEE_FILTER } from './employees.queries'
import { useCreateEmployee } from './use-create-employee'
import { useDismissEmployee } from './use-dismiss-employee'
import { useReplaceRoles } from './use-replace-roles'
import { useRestoreEmployee } from './use-restore-employee'
import { useUpdateEmployee } from './use-update-employee'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'adm', mustChangePassword: false, roles: ['admin'], fullName: 'adm', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('employeesQuery', () => {
  it('the default filter is status all, no search, no department, first page', () => {
    expect(DEFAULT_EMPLOYEE_FILTER).toEqual({ search: '', departmentId: undefined, status: 'all', page: 0 })
  })

  it('keys differ by search, department, status and page', () => {
    const base = employeesQuery({ status: 'all', page: 0 }).queryKey
    expect(employeesQuery({ search: 'а', status: 'all', page: 0 }).queryKey).not.toEqual(base)
    expect(employeesQuery({ departmentId: 'd1', status: 'all', page: 0 }).queryKey).not.toEqual(base)
    expect(employeesQuery({ status: 'dismissed', page: 0 }).queryKey).not.toEqual(base)
    expect(employeesQuery({ status: 'all', page: 1 }).queryKey).not.toEqual(base)
    expect(base[0]).toBe(EMPLOYEES_KEY[0])
  })

  it('loads the page using the URL-style parameters', async () => {
    const { calls } = stubFetch(() => json(page([employeeFixture])))
    const data = await createTestClient().fetchQuery(employeesQuery({ search: 'иван', departmentId: 'd1', status: 'active', page: 1 }))
    const params = new URLSearchParams(calls[0]?.search)
    expect(data.items).toHaveLength(1)
    expect(params.get('search')).toBe('иван')
    expect(params.get('departmentId')).toBe('d1')
    expect(params.get('isActive')).toBe('true')
    expect(params.get('page')).toBe('1')
  })

  it('without parameters loads everyone (active and dismissed)', async () => {
    const { calls } = stubFetch(() => json(page([])))
    await createTestClient().fetchQuery(employeesQuery(DEFAULT_EMPLOYEE_FILTER))
    expect(new URLSearchParams(calls[0]?.search).has('isActive')).toBe(false)
  })
})

describe('employeeQuery', () => {
  it('loads the card by id and keys by id', async () => {
    const { calls } = stubFetch(() => json(employeeFixture))
    expect(employeeQuery('e1').queryKey).not.toEqual(employeeQuery('e2').queryKey)
    expect((await createTestClient().fetchQuery(employeeQuery('e1'))).login).toBe('ivanov')
    expect(calls[0]?.path).toBe('/admin/employees/e1')
  })
})

describe('useCreateEmployee', () => {
  it('returns the temporary password and does not keep it in the cache', async () => {
    stubFetch(() => json({ employee: employeeFixture, temporaryPassword: 'Tmp-pass-1' }, 201))
    const client = createTestClient()
    const { result } = renderHook(() => useCreateEmployee(), { wrapper: queryWrapper(client) })
    let created: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined
    await act(async () => {
      created = await result.current.mutateAsync({ login: 'ivanov', lastName: 'Иванов', firstName: 'Иван' })
    })
    expect(created?.temporaryPassword).toBe('Tmp-pass-1')
    const mutations = client.getMutationCache().getAll()
    expect(mutations[0]?.options.gcTime).toBe(0)
  })

  it('after the mutation unmounts the password is gone from the mutation cache', async () => {
    stubFetch(() => json({ employee: employeeFixture, temporaryPassword: 'Tmp-pass-1' }, 201))
    const client = createTestClient()
    const { result, unmount } = renderHook(() => useCreateEmployee(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync({ login: 'ivanov', lastName: 'Иванов', firstName: 'Иван' })
    })
    unmount()
    await waitFor(() => expect(JSON.stringify(client.getMutationCache().getAll().map((m) => m.state.data))).not.toContain('Tmp-pass-1'))
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain('Tmp-pass-1')
  })

  it('invalidates the employees list but puts no card into the query cache', async () => {
    stubFetch(() => json({ employee: employeeFixture, temporaryPassword: 'Tmp-pass-1' }, 201))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateEmployee(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync({ login: 'ivanov', lastName: 'Иванов', firstName: 'Иван' })
    })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: EMPLOYEES_KEY }))
  })

  it('exposes LOGIN_TAKEN as an ApiError', async () => {
    stubFetch(() => json({ message: 'taken', code: 'LOGIN_TAKEN' }, 409))
    const { result } = renderHook(() => useCreateEmployee(), { wrapper: queryWrapper() })
    act(() => result.current.mutate({ login: 'ivanov', lastName: 'Иванов', firstName: 'Иван' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ kind: 'conflict', code: 'LOGIN_TAKEN' })
  })
})

describe('a deleted department', () => {
  it('useCreateEmployee reloads the departments on DEPARTMENT_NOT_FOUND', async () => {
    stubFetch(() => json({ message: 'gone', code: 'DEPARTMENT_NOT_FOUND' }, 404))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateEmployee(), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate({ login: 'ivanov', lastName: 'Иванов', firstName: 'Иван', departmentId: 'd-gone' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(DEPARTMENTS_KEY)
  })

  it('useUpdateEmployee reloads the departments on DEPARTMENT_NOT_FOUND', async () => {
    stubFetch(() => json({ message: 'gone', code: 'DEPARTMENT_NOT_FOUND' }, 404))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateEmployee('e1'), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate({ departmentId: 'd-gone' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(DEPARTMENTS_KEY)
  })

  it('a taken login does not reload the departments', async () => {
    stubFetch(() => json({ message: 'taken', code: 'LOGIN_TAKEN' }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateEmployee(), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate({ login: 'ivanov', lastName: 'Иванов', firstName: 'Иван' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).not.toContainEqual(DEPARTMENTS_KEY)
  })
})

describe.each([
  ['useUpdateEmployee', () => useUpdateEmployee('e1'), { position: 'Главбух' }],
  ['useReplaceRoles', () => useReplaceRoles('e1'), ['admin'] as ('admin' | 'developer')[]],
  ['useDismissEmployee', () => useDismissEmployee('e1'), undefined],
  ['useRestoreEmployee', () => useRestoreEmployee('e1'), undefined]
] as const)('%s', (_name, useHook, input) => {
  it('refreshes the list and the card on success and returns the updated card', async () => {
    stubFetch(() => json(employeeFixture))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useHook(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await (result.current.mutateAsync as (v: unknown) => Promise<unknown>)(input)
    })
    await waitFor(() => expect(result.current.data).toMatchObject({ id: 'e1' }))
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(EMPLOYEES_KEY)
    expect(keys).toContainEqual(employeeQuery('e1').queryKey)
  })

  it('on LAST_ADMIN refreshes the card and exposes the code', async () => {
    stubFetch(() => json({ message: 'last', code: 'LAST_ADMIN' }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useHook(), { wrapper: queryWrapper(client) })
    act(() => (result.current.mutate as (v: unknown) => void)(input))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ kind: 'conflict', code: 'LAST_ADMIN' })
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(employeeQuery('e1').queryKey)
  })
})

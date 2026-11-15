import { act, renderHook } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { CATALOG_KEY, DEPARTMENTS_KEY } from '@/lib/query-keys'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { catalogFixture } from './catalog.fixtures'
import { catalogQuery } from './catalog.queries'
import { useSetProductDepartments } from './use-set-product-departments'
import { groupByStatus, selectAgent } from './roadmap'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('catalogQuery', () => {
  it('uses the shared key and loads GET /portal/catalog through the schema', async () => {
    const { calls } = stubFetch(() => json(catalogFixture))
    const options = catalogQuery()
    expect(options.queryKey).toEqual(CATALOG_KEY)
    const data = await new QueryClient().fetchQuery(options)
    expect(calls[0]?.path).toBe('/portal/catalog')
    expect(data.products).toHaveLength(3)
  })

  it('rejects an answer that does not match the schema', async () => {
    stubFetch(() => json({ products: [{ id: 1 }] }))
    await expect(new QueryClient().fetchQuery(catalogQuery())).rejects.toBeTruthy()
  })
})

describe('selectAgent', () => {
  it('finds an agent by id, also when it sits in several products', () => {
    expect(selectAgent(catalogFixture, 'a-assistant')?.name).toBe('Ассистент')
    expect(selectAgent(catalogFixture, 'a-analyst')?.name).toBe('Аналитик звонков')
  })

  it('returns undefined for an unknown id', () => {
    expect(selectAgent(catalogFixture, 'nope')).toBeUndefined()
  })
})

describe('groupByStatus', () => {
  it('orders the groups: planned, in_dev, testing, rework, launched', () => {
    expect(groupByStatus(catalogFixture).map((g) => g.status)).toEqual(['planned', 'in_dev', 'testing', 'rework', 'launched'])
  })

  it('lists a skill of an agent from two products once', () => {
    const ids = groupByStatus(catalogFixture).flatMap((g) => g.skills.map((s) => s.id))
    expect(ids.sort()).toEqual(['s1', 's2', 's3'])
  })

  it('puts skills into their status group with the agent', () => {
    const groups = groupByStatus(catalogFixture)
    const launched = groups.find((g) => g.status === 'launched')
    expect(launched?.skills[0]).toMatchObject({ id: 's1', agent: { id: 'a-assistant', name: 'Ассистент' } })
    expect(groups.find((g) => g.status === 'testing')?.skills).toEqual([])
  })

  it('keeps a skill when its agent belongs to the chosen product', () => {
    const ids = groupByStatus(catalogFixture, 'p-tg').flatMap((g) => g.skills.map((s) => s.id))
    expect(ids.sort()).toEqual(['s1', 's2'])
  })

  it('returns empty groups for a product without agents', () => {
    expect(groupByStatus(catalogFixture, 'p-web').every((g) => g.skills.length === 0)).toBe(true)
  })
})

describe('catalog departments', () => {
  it('parses departments of a product and of the products of an agent', async () => {
    stubFetch(() => json(catalogFixture))
    const data = await new QueryClient().fetchQuery(catalogQuery())
    expect(data.products[0]?.departments).toEqual([
      { id: 'd-kc1', name: 'КЦ 1' },
      { id: 'd-kc2', name: 'КЦ 2' }
    ])
    expect(data.products[0]?.agents[0]?.products[0]?.departments).toHaveLength(2)
    expect(data.products[2]?.departments).toEqual([])
  })

  it('rejects a product without the departments field', async () => {
    const { departments: _omit, ...bare } = catalogFixture.products[2]!
    stubFetch(() => json({ products: [bare] }))
    await expect(new QueryClient().fetchQuery(catalogQuery())).rejects.toBeTruthy()
  })
})

describe('useSetProductDepartments', () => {
  function setup() {
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSetProductDepartments(), { wrapper: queryWrapper(client) })
    return { result, spy }
  }
  const answer = { id: 'p-cc', slug: 'control-center', name: 'Control Center', departments: [{ id: 'd-kc1', name: 'КЦ 1' }] }

  it('PUTs the whole set and reloads the catalog on success', async () => {
    const { calls } = stubFetch(() => json(answer))
    const { result, spy } = setup()
    await act(() => result.current.mutateAsync({ productId: 'p-cc', departmentIds: ['d-kc1'] }))
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/portal/products/p-cc/departments', body: { departmentIds: ['d-kc1'] } })
    expect(spy).toHaveBeenCalledWith({ queryKey: CATALOG_KEY })
    expect(spy).not.toHaveBeenCalledWith({ queryKey: DEPARTMENTS_KEY })
  })

  it('reloads the catalog and the departments on 404', async () => {
    stubFetch(() => json({ code: 'PORTAL_DEPARTMENT_NOT_FOUND', message: 'нет' }, 404))
    const { result, spy } = setup()
    await act(async () => {
      await result.current.mutateAsync({ productId: 'p-cc', departmentIds: ['x'] }).catch(() => undefined)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: CATALOG_KEY })
    expect(spy).toHaveBeenCalledWith({ queryKey: DEPARTMENTS_KEY })
  })

  it('does not reload anything on other errors', async () => {
    stubFetch(() => json({ message: 'boom' }, 500))
    const { result, spy } = setup()
    await act(async () => {
      await result.current.mutateAsync({ productId: 'p-cc', departmentIds: [] }).catch(() => undefined)
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

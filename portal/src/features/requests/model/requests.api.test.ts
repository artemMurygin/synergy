import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, page, requestFixture, stubFetch } from '@/test/helpers'
import { getRequest, listMyRequests, submitRequest } from './requests.api'

const body = {
  title: 'Сверка актов',
  description: 'Сверяю',
  frequency: { count: 5, period: 'week' as const },
  minutesPerRun: 20,
  peopleCount: 3
}

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('requests.api', () => {
  it('submitRequest posts the body to /portal/requests and parses the created request', async () => {
    const { calls } = stubFetch(() => json(requestFixture, 201))
    const created = await submitRequest(body)
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/requests', body })
    expect(created.id).toBe(requestFixture.id)
  })

  it('listMyRequests asks /portal/requests/my with the page', async () => {
    const { calls } = stubFetch(() => json(page([requestFixture], 2)))
    const result = await listMyRequests(2)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/portal/requests/my' })
    expect(new URLSearchParams(calls[0]?.search).get('page')).toBe('2')
    expect(result.items).toHaveLength(1)
  })

  it('getRequest asks /portal/requests/:id', async () => {
    const { calls } = stubFetch(() => json(requestFixture))
    await getRequest(requestFixture.id)
    expect(calls[0]).toMatchObject({ method: 'GET', path: `/portal/requests/${requestFixture.id}` })
  })

  it('rejects an answer of an unexpected shape', async () => {
    stubFetch(() => json({ nope: true }))
    await expect(getRequest(requestFixture.id)).rejects.toMatchObject({ kind: 'unexpected' })
  })
})

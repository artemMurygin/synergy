import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { ApiError } from '@/lib/errors'
import { createTestClient, json, page, queryWrapper, requestFixture, stubFetch } from '@/test/helpers'
import { REQUESTS_KEY, requestQuery } from '@/features/requests'
import { acceptRequest, listQueue, rejectRequest, takeRequest } from './decision.api'
import { decisionErrorMessage, DECISION_CONFLICT_MESSAGE, queueQuery } from './decision.queries'
import { useAcceptRequest } from './use-accept-request'
import { useRejectRequest } from './use-reject-request'
import { useTakeRequest } from './use-take-request'

const id = requestFixture.id

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('decision.api', () => {
  it('listQueue asks /portal/queue with the page', async () => {
    const { calls } = stubFetch(() => json(page([requestFixture])))
    await listQueue(3)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/portal/queue' })
    expect(new URLSearchParams(calls[0]?.search).get('page')).toBe('3')
  })

  it('takeRequest posts to /take with no body', async () => {
    const { calls } = stubFetch(() => json(requestFixture))
    await takeRequest(id)
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/portal/requests/${id}/take` })
  })

  it('acceptRequest sends effortHours and an existing_skill target', async () => {
    const { calls } = stubFetch(() => json(requestFixture))
    await acceptRequest(id, { effortHours: 16, target: { kind: 'existing_skill', skillId: 's1' } })
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `/portal/requests/${id}/accept`,
      body: { effortHours: 16, target: { kind: 'existing_skill', skillId: 's1' } }
    })
  })

  it('acceptRequest sends a new_skill target', async () => {
    const { calls } = stubFetch(() => json(requestFixture))
    await acceptRequest(id, { effortHours: 8, target: { kind: 'new_skill', agentId: 'a1', name: 'Сверка', description: 'д' } })
    expect(calls[0]?.body).toEqual({ effortHours: 8, target: { kind: 'new_skill', agentId: 'a1', name: 'Сверка', description: 'д' } })
  })

  it('acceptRequest sends a new_agent target with a new product', async () => {
    const { calls } = stubFetch(() => json(requestFixture))
    const target = {
      kind: 'new_agent' as const,
      agent: { name: 'Агент', productIds: ['p1'], newProduct: { name: 'Продукт' } },
      skill: { name: 'Навык', description: 'д' }
    }
    await acceptRequest(id, { effortHours: 40, target })
    expect(calls[0]?.body).toEqual({ effortHours: 40, target })
  })

  it('rejectRequest sends the reason', async () => {
    const { calls } = stubFetch(() => json(requestFixture))
    await rejectRequest(id, 'Уже есть')
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/portal/requests/${id}/reject`, body: { reason: 'Уже есть' } })
  })
})

describe('queueQuery', () => {
  it('has a page-specific key and loads the queue', async () => {
    expect(queueQuery(0).queryKey).not.toEqual(queueQuery(1).queryKey)
    stubFetch(() => json(page([requestFixture])))
    expect((await createTestClient().fetchQuery(queueQuery(0))).items).toHaveLength(1)
  })
})

describe('decisionErrorMessage', () => {
  it('names the conflict explicitly', () => {
    expect(decisionErrorMessage(new ApiError('conflict', 'x', 409))).toBe(DECISION_CONFLICT_MESSAGE)
    expect(DECISION_CONFLICT_MESSAGE).toMatch(/уже принято/)
  })
  it('falls back to the server message for other errors', () => {
    expect(decisionErrorMessage(new ApiError('unexpected', 'Сервер упал', 500))).toBe('Сервер упал')
  })
})

describe.each([
  ['useAcceptRequest', () => useAcceptRequest(), { requestId: id, effortHours: 16, target: { kind: 'existing_skill', skillId: 's1' } }],
  ['useRejectRequest', () => useRejectRequest(), { requestId: id, reason: 'Нет' }]
] as const)('%s', (_name, useHook, variables) => {
  function seededClient() {
    const client = createTestClient()
    client.setQueryData(queueQuery(0).queryKey, page([requestFixture, { ...requestFixture, id: 'other' }]))
    return client
  }

  it('on success removes the request from the cached queue and invalidates the queue', async () => {
    stubFetch(() => json(requestFixture))
    const client = seededClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useHook() as ReturnType<typeof useAcceptRequest>, { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync(variables as never)
    })
    const cached = client.getQueryData(queueQuery(0).queryKey)
    expect(cached?.items.map((r) => r.id)).toEqual(['other'])
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['queue'] }))
  })

  it('on 409 keeps the message and refreshes the queue', async () => {
    stubFetch(() => json({ message: 'decided' }, 409))
    const client = seededClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useHook() as ReturnType<typeof useAcceptRequest>, { wrapper: queryWrapper(client) })
    act(() => result.current.mutate(variables as never))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(decisionErrorMessage(result.current.error)).toBe(DECISION_CONFLICT_MESSAGE)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['queue'] }))
  })
})

describe.each([
  ['PORTAL_SKILL_ARCHIVED', /архив/i],
  ['PORTAL_AGENT_ARCHIVED', /архив/i]
] as const)('useAcceptRequest on 409 %s', (code, pattern) => {
  it('shows the archive message, reloads skills and agents and keeps the request in the queue', async () => {
    stubFetch(() => json({ message: 'x', code }, 409))
    const client = createTestClient()
    client.setQueryData(queueQuery(0).queryKey, page([requestFixture]))
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useAcceptRequest(), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate({ requestId: id, effortHours: 16, target: { kind: 'existing_skill', skillId: 's1' } }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    const message = decisionErrorMessage(result.current.error)
    expect(message).toMatch(pattern)
    expect(message).not.toBe(DECISION_CONFLICT_MESSAGE)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['skills'] }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['agents'] }))
    expect(client.getQueryData<{ items: unknown[] }>(queueQuery(0).queryKey)?.items).toHaveLength(1)
  })
})

describe('decisionErrorMessage by code', () => {
  it.each([
    ['PORTAL_REQUEST_ALREADY_TAKEN', /уже взял/i],
    ['PORTAL_REQUEST_NOT_TAKEN', /сначала возьмите/i],
    ['PORTAL_REQUEST_ALREADY_DECIDED', /уже принято/i],
    ['PORTAL_SKILL_ARCHIVED', /навык.*архив/i],
    ['PORTAL_AGENT_ARCHIVED', /агент.*архив/i],
    ['PORTAL_AGENT_NAME_TAKEN', /агент с таким названием уже есть/i],
    ['PORTAL_PRODUCT_NAME_TAKEN', /продукт с таким названием уже есть/i],
    ['PORTAL_PRODUCT_NOT_FOUND', /продукт.*не найден/i]
  ])('%s has its own message regardless of the server text', (code, pattern) => {
    const status = code === 'PORTAL_PRODUCT_NOT_FOUND' ? 404 : 409
    const kind = status === 404 ? 'not_found' : 'conflict'
    expect(decisionErrorMessage(new ApiError(kind, 'любой текст', status, code))).toMatch(pattern)
  })

  it('does not depend on the message text for plain conflicts', () => {
    expect(decisionErrorMessage(new ApiError('conflict', 'PORTAL_REQUEST_ALREADY_TAKEN', 409))).toBe(DECISION_CONFLICT_MESSAGE)
  })
})

describe('useAcceptRequest on name conflicts', () => {
  it.each(['PORTAL_AGENT_NAME_TAKEN', 'PORTAL_PRODUCT_NAME_TAKEN'])('%s invalidates nothing', async (code) => {
    stubFetch(() => json({ message: 'x', code }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useAcceptRequest(), { wrapper: queryWrapper(client) })
    act(() =>
      result.current.mutate({
        requestId: id,
        effortHours: 8,
        target: { kind: 'new_agent', agent: { name: 'A', productIds: ['p'] }, skill: { name: 'S', description: 'd' } }
      })
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('useTakeRequest', () => {
  it('on success puts the request into the cache and invalidates the queue', async () => {
    const taken = { ...requestFixture, status: { code: 'under_review' as const, label: 'На рассмотрении' } }
    stubFetch(() => json(taken))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useTakeRequest(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync(id)
    })
    expect(client.getQueryData(requestQuery(id).queryKey)).toMatchObject({ id, status: { code: 'under_review' } })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['queue'] }))
  })

  it('on 409 invalidates the request and the queue', async () => {
    stubFetch(() => json({ message: 'x', code: 'PORTAL_REQUEST_ALREADY_TAKEN' }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useTakeRequest(), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate(id))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['queue'] }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: requestQuery(id).queryKey }))
    expect(REQUESTS_KEY).toEqual(['requests'])
  })
})

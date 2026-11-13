import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { ApiError } from '@/lib/errors'
import { createTestClient, json, page, queryWrapper, requestFixture, stubFetch } from '@/test/helpers'
import { acceptRequest, listQueue, rejectRequest } from './decision.api'
import { decisionErrorMessage, DECISION_CONFLICT_MESSAGE, queueQuery } from './decision.queries'
import { useAcceptRequest } from './use-accept-request'
import { useRejectRequest } from './use-reject-request'

const id = requestFixture.id

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'] })
})
afterEach(() => vi.unstubAllGlobals())

describe('decision.api', () => {
  it('listQueue asks /portal/queue with the page', async () => {
    const { calls } = stubFetch(() => json(page([requestFixture])))
    await listQueue(3)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/portal/queue' })
    expect(new URLSearchParams(calls[0]?.search).get('page')).toBe('3')
  })

  it('acceptRequest sends {skillId} for an existing skill', async () => {
    const { calls } = stubFetch(() => json(requestFixture))
    await acceptRequest(id, { skillId: 's1' })
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/portal/requests/${id}/accept`, body: { skillId: 's1' } })
  })

  it('acceptRequest sends {agentId,name,description} for a new skill', async () => {
    const { calls } = stubFetch(() => json(requestFixture))
    await acceptRequest(id, { agentId: 'a1', name: 'Сверка', description: 'д' })
    expect(calls[0]?.body).toEqual({ agentId: 'a1', name: 'Сверка', description: 'д' })
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
  ['useAcceptRequest', () => useAcceptRequest(), { requestId: id, target: { skillId: 's1' } }],
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

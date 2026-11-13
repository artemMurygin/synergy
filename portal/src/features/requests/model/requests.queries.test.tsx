import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/errors'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, page, queryWrapper, requestFixture, stubFetch } from '@/test/helpers'
import { myRequestsQuery, requestQuery } from './requests.queries'
import { useSubmitRequest } from './use-submit-request'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [] })
})
afterEach(() => vi.unstubAllGlobals())

describe('myRequestsQuery', () => {
  it('has a page-specific key and loads the page', async () => {
    expect(myRequestsQuery(1).queryKey).not.toEqual(myRequestsQuery(2).queryKey)
    stubFetch(() => json(page([requestFixture])))
    const client = createTestClient()
    const data = await client.fetchQuery(myRequestsQuery(0))
    expect(data.total).toBe(1)
  })

  it('always refetches on mount so the status is fresh', () => {
    expect(myRequestsQuery(0).refetchOnMount).toBe('always')
  })
})

describe('requestQuery', () => {
  it('turns a 404 into a "not found" error', async () => {
    stubFetch(() => json({ message: 'no' }, 404))
    await expect(createTestClient().fetchQuery(requestQuery(requestFixture.id))).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('treats a malformed id as not found without calling the server', async () => {
    const { fn } = stubFetch(() => json(requestFixture))
    await expect(createTestClient().fetchQuery(requestQuery('../etc'))).rejects.toMatchObject({ kind: 'not_found' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('treats a 400 for the id as not found as well', async () => {
    stubFetch(() => json({ message: 'bad id' }, 400))
    await expect(createTestClient().fetchQuery(requestQuery(requestFixture.id))).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('does not retry a missing request', () => {
    const retry = requestQuery(requestFixture.id).retry as (n: number, e: unknown) => boolean
    expect(retry(0, new ApiError('not_found', 'x', 404))).toBe(false)
  })
})

describe('useSubmitRequest', () => {
  const body = {
    title: 'Акты',
    description: 'д',
    frequency: { count: 1, period: 'day' as const },
    minutesPerRun: 5,
    peopleCount: 1
  }

  it('invalidates the requests list after success', async () => {
    stubFetch(() => json(requestFixture, 201))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSubmitRequest(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync(body)
    })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: myRequestsQuery(0).queryKey.slice(0, 2) }))
  })

  it('keeps the error and does not invalidate when the server fails', async () => {
    stubFetch(() => json({ message: 'boom' }, 500))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSubmitRequest(), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate(body))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ kind: 'unexpected' })
    expect(result.current.variables).toEqual(body)
    expect(spy).not.toHaveBeenCalled()
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { ApiError } from '@/lib/errors'
import { BUGS_KEY, CATALOG_KEY } from '@/lib/query-keys'
import { createTestClient, json, page, queryWrapper, stubFetch } from '@/test/helpers'
import { bugErrorMessage, BUG_INVALID_TRANSITION_MESSAGE } from './bugs.errors'
import { bugFixture, bugListItemFixture } from './bugs.fixtures'
import { bugQuery, bugQueueQuery, myBugsQuery } from './bugs.queries'
import { useChangeBugStatus } from './use-change-bug-status'
import { useReportBug } from './use-report-bug'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('query keys', () => {
  it('are scoped under BUGS_KEY and differ by page and filter', () => {
    expect(myBugsQuery(0).queryKey).toEqual([...BUGS_KEY, 'my', 0])
    expect(myBugsQuery(1).queryKey).not.toEqual(myBugsQuery(0).queryKey)
    expect(bugQueueQuery('unclosed', 0).queryKey).toEqual([...BUGS_KEY, 'queue', 'unclosed', 0])
    expect(bugQueueQuery('resolved', 0).queryKey).not.toEqual(bugQueueQuery('unclosed', 0).queryKey)
    expect(bugQuery('x').queryKey).toEqual([...BUGS_KEY, 'detail', 'x'])
  })
})

describe('queries', () => {
  it('myBugsQuery loads the page', async () => {
    stubFetch(() => json(page([bugListItemFixture])))
    const data = await createTestClient().fetchQuery(myBugsQuery(0))
    expect(data.total).toBe(1)
  })

  it('bugQueueQuery keeps the previous list while the next one loads', () => {
    expect(bugQueueQuery('unclosed', 0).placeholderData).toBeTypeOf('function')
    const keep = bugQueueQuery('unclosed', 0).placeholderData as (prev: unknown) => unknown
    expect(keep('prev')).toBe('prev')
  })

  it('bugQuery turns a 404 and a malformed id into "not found"', async () => {
    stubFetch(() => json({ message: 'no' }, 404))
    await expect(createTestClient().fetchQuery(bugQuery(bugFixture.id))).rejects.toMatchObject({ kind: 'not_found' })
    const { fn } = stubFetch(() => json(bugFixture))
    await expect(createTestClient().fetchQuery(bugQuery('../etc'))).rejects.toMatchObject({ kind: 'not_found' })
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('useReportBug', () => {
  const body = { title: 'т', description: 'д', productId: 'p1', agentId: 'a1' }

  it('on success invalidates the "my" lists', async () => {
    stubFetch(() => json(bugFixture, 201))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useReportBug(), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync(body))
    expect(spy).toHaveBeenCalledWith({ queryKey: [...BUGS_KEY, 'my'] })
  })

  it('on 409 invalidates the catalog', async () => {
    stubFetch(() => json({ message: 'archived', code: 'PORTAL_AGENT_ARCHIVED' }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useReportBug(), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync(body).catch(() => undefined))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: CATALOG_KEY })
  })
})

describe('useChangeBugStatus', () => {
  it('on success updates the detail and invalidates the lists', async () => {
    const changed = { ...bugFixture, status: 'in_progress' as const }
    stubFetch(() => json(changed))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useChangeBugStatus(bugFixture.id), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync({ status: 'in_progress' }))
    expect(client.getQueryData(bugQuery(bugFixture.id).queryKey)).toEqual(changed)
    expect(spy).toHaveBeenCalledWith({ queryKey: [...BUGS_KEY, 'my'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: [...BUGS_KEY, 'queue'] })
  })

  it('on 409 invalidates the detail', async () => {
    stubFetch(() => json({ message: 'x', code: 'PORTAL_BUG_INVALID_TRANSITION' }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useChangeBugStatus(bugFixture.id), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync({ status: 'resolved' }).catch(() => undefined))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: bugQuery(bugFixture.id).queryKey })
  })
})

describe('bugErrorMessage', () => {
  const err = (code: string, status: number) => new ApiError(status === 409 ? 'conflict' : status === 404 ? 'not_found' : 'bad_request', 'srv', status, code)

  it('picks the text by code', () => {
    expect(bugErrorMessage(err('PORTAL_BUG_INVALID_TRANSITION', 409))).toBe(BUG_INVALID_TRANSITION_MESSAGE)
    expect(bugErrorMessage(err('PORTAL_BUG_INVALID_TRANSITION', 409))).toBe('Статус бага уже изменился')
    expect(bugErrorMessage(err('PORTAL_AGENT_ARCHIVED', 409))).toBe('Агент больше недоступен')
    expect(bugErrorMessage(err('PORTAL_AGENT_NOT_IN_PRODUCT', 400))).toBe('Агент не входит в выбранный продукт')
    expect(bugErrorMessage(err('PORTAL_BUG_NOT_FOUND', 404))).toBe('Обращение не найдено')
  })

  it('falls back for unknown codes and non-API errors, never showing the server text', () => {
    const text = bugErrorMessage(err('SOMETHING', 400))
    expect(text).not.toContain('srv')
    expect(bugErrorMessage(new Error('boom'))).toBe(text)
  })
})

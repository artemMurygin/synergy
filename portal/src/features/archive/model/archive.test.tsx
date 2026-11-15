import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { ApiError } from '@/lib/errors'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { archiveQuery } from './archive.queries'
import { AGENT_ARCHIVED_MESSAGE, restoreErrorMessage, useRestoreAgent, useRestoreSkill } from './use-restore'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

const product = { id: 'p1', slug: 'control-center', name: 'Control Center' }
const archive = {
  agents: [{ id: 'a1', name: 'Сводка продаж', products: [product], skillsCount: 1, archivedAt: '2026-11-10T09:00:00.000Z' }],
  skills: []
}

describe('archiveQuery', () => {
  it('loads and validates the archive', async () => {
    const { calls } = stubFetch(() => json(archive))
    expect(await createTestClient().fetchQuery(archiveQuery())).toEqual(archive)
    expect(calls[0]?.path).toBe('/portal/archive')
  })
})

describe('useRestoreAgent', () => {
  it('posts restore and invalidates archive, catalog, skills and agents', async () => {
    const { calls } = stubFetch(() => json({ id: 'a1', name: 'Сводка продаж', products: [product] }))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRestoreAgent(), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync('a1'))
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/agents/a1/restore' })
    const keys = spy.mock.calls.map((c) => (c[0]?.queryKey as string[])[0])
    expect(keys).toEqual(expect.arrayContaining(['archive', 'catalog', 'skills', 'agents']))
  })
})

describe('useRestoreSkill', () => {
  const skill = {
    id: 's1', name: 'Отчёт', description: '', status: 'launched', agent: { id: 'a1', name: 'Сводка продаж' }, requestsCount: 0,
    createdAt: '2026-11-01T09:00:00.000Z', statusChangedAt: '2026-11-02T09:00:00.000Z', products: [product], nextStatuses: ['rework'], archivedAt: null
  }

  it('posts restore and invalidates the four caches', async () => {
    const { calls } = stubFetch(() => json(skill))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRestoreSkill(), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync('s1'))
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/skills/s1/restore' })
    const keys = spy.mock.calls.map((c) => (c[0]?.queryKey as string[])[0])
    expect(keys).toEqual(expect.arrayContaining(['archive', 'catalog', 'skills', 'agents']))
  })

  it('exposes the 409 PORTAL_AGENT_ARCHIVED error', async () => {
    stubFetch(() => json({ statusCode: 409, code: 'PORTAL_AGENT_ARCHIVED', message: 'agent archived' }, 409))
    const { result } = renderHook(() => useRestoreSkill(), { wrapper: queryWrapper() })
    act(() => result.current.mutate('s1'))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(restoreErrorMessage(result.current.error)).toBe(AGENT_ARCHIVED_MESSAGE)
  })
})

describe('restoreErrorMessage', () => {
  it('maps the agent-archived code and falls back to the api message', () => {
    expect(AGENT_ARCHIVED_MESSAGE).toBe('Сначала восстановите агента')
    expect(restoreErrorMessage(new ApiError('conflict', 'x', 409, 'PORTAL_AGENT_ARCHIVED'))).toBe('Сначала восстановите агента')
    expect(restoreErrorMessage(new ApiError('unavailable', 'Сервер недоступен'))).toBe('Сервер недоступен')
    expect(restoreErrorMessage(new Error('boom'))).toBe('Не удалось восстановить')
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { agentFixture, createTestClient, json, page, queryWrapper, skillFixture, stubFetch } from '@/test/helpers'
import { agentsQuery } from './catalog.queries'
import { skillsQuery } from './skills.queries'
import { useChangeSkillStatus } from './use-change-skill-status'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'] })
})
afterEach(() => vi.unstubAllGlobals())

describe('skillsQuery', () => {
  it('keys differ by filter and page', () => {
    expect(skillsQuery('planned', 0).queryKey).not.toEqual(skillsQuery('in_dev', 0).queryKey)
    expect(skillsQuery(undefined, 0).queryKey).not.toEqual(skillsQuery(undefined, 1).queryKey)
  })

  it('loads the filtered page', async () => {
    const { calls } = stubFetch(() => json(page([skillFixture])))
    const data = await createTestClient().fetchQuery(skillsQuery('planned', 0))
    expect(data.items).toHaveLength(1)
    expect(new URLSearchParams(calls[0]?.search).get('status')).toBe('planned')
  })
})

describe('agentsQuery', () => {
  it('loads agents with products', async () => {
    stubFetch(() => json([agentFixture]))
    expect(await createTestClient().fetchQuery(agentsQuery())).toEqual([agentFixture])
  })
})

describe('useChangeSkillStatus', () => {
  it('returns the updated skill and invalidates the skills lists', async () => {
    stubFetch(() => json({ ...skillFixture, status: 'in_dev' }))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useChangeSkillStatus(), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync({ skillId: 's1', to: 'in_dev' })
    })
    await waitFor(() => expect(result.current.data?.status).toBe('in_dev'))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['skills'] }))
  })

  it('on 409 refreshes the skills and exposes the conflict message', async () => {
    stubFetch(() => json({ message: 'conflict' }, 409))
    const client = createTestClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useChangeSkillStatus(), { wrapper: queryWrapper(client) })
    act(() => result.current.mutate({ skillId: 's1', to: 'in_dev' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ kind: 'conflict' })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['skills'] }))
  })
})

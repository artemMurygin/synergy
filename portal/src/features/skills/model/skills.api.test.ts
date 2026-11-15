import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { agentFixture, json, page, skillFixture, stubFetch } from '@/test/helpers'
import { changeSkillStatus, listAgents, listSkills } from './skills.api'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('skills.api', () => {
  it('listSkills sends the status filter and the page', async () => {
    const { calls } = stubFetch(() => json(page([skillFixture])))
    await listSkills('in_dev', 1)
    const params = new URLSearchParams(calls[0]?.search)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/portal/skills' })
    expect(params.get('status')).toBe('in_dev')
    expect(params.get('page')).toBe('1')
  })

  it('listSkills without a filter sends no status', async () => {
    const { calls } = stubFetch(() => json(page([skillFixture])))
    await listSkills(undefined, 0)
    expect(new URLSearchParams(calls[0]?.search).has('status')).toBe(false)
  })

  it('changeSkillStatus posts the new status', async () => {
    const { calls } = stubFetch(() => json({ ...skillFixture, status: 'in_dev' }))
    const skill = await changeSkillStatus('s1', 'in_dev')
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/skills/s1/status', body: { status: 'in_dev' } })
    expect(skill.status).toBe('in_dev')
  })

  it('listAgents returns agents with their products from a plain array', async () => {
    stubFetch(() => json([agentFixture]))
    expect(await listAgents()).toEqual([agentFixture])
  })

  it('listAgents also accepts a paged answer', async () => {
    stubFetch(() => json(page([agentFixture])))
    expect(await listAgents()).toEqual([agentFixture])
  })
})

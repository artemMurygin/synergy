import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, page, stubFetch } from '@/test/helpers'
import { changeBugStatus, getBug, listBugQueue, listMyBugs, reportBug } from './bugs.api'
import { bugFixture, bugListItemFixture } from './bugs.fixtures'
import { bugListItemSchema, bugResponseSchema, bugStatusSchema } from './bugs.schema'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('bugs.schema', () => {
  it('parses fixtures built from the backend response format', () => {
    expect(bugResponseSchema.parse(bugFixture)).toEqual(bugFixture)
    expect(bugListItemSchema.parse(bugListItemFixture)).toEqual(bugListItemFixture)
    expect(bugResponseSchema.parse({ ...bugFixture, status: 'wont_fix', wontFixReason: 'дубль', nextStatuses: ['in_progress'], statusChangedBy: bugFixture.author }).nextStatuses).toEqual(['in_progress'])
  })

  it('rejects an unknown status and a malformed answer', () => {
    expect(bugStatusSchema.safeParse('closed').success).toBe(false)
    expect(bugResponseSchema.safeParse({ ...bugFixture, status: 'closed' }).success).toBe(false)
    expect(bugResponseSchema.safeParse({ nope: true }).success).toBe(false)
  })
})

describe('bugs.api', () => {
  const body = { title: 'Не отвечает', description: 'д', productId: 'p1', agentId: 'a1' }

  it('reportBug posts to /portal/bugs and parses the created bug', async () => {
    const { calls } = stubFetch(() => json(bugFixture, 201))
    const created = await reportBug(body)
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/bugs', body })
    expect(created.id).toBe(bugFixture.id)
  })

  it('listMyBugs asks /portal/bugs/my with the page', async () => {
    const { calls } = stubFetch(() => json(page([bugListItemFixture], 2)))
    const result = await listMyBugs(2)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/portal/bugs/my' })
    expect(new URLSearchParams(calls[0]?.search).get('page')).toBe('2')
    expect(result.items).toHaveLength(1)
  })

  it('listBugQueue sends status only for a concrete status', async () => {
    const { calls } = stubFetch(() => json(page([bugListItemFixture])))
    await listBugQueue('unclosed', 0)
    await listBugQueue('in_progress', 1)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/portal/bugs/queue' })
    expect(new URLSearchParams(calls[0]?.search).has('status')).toBe(false)
    expect(new URLSearchParams(calls[1]?.search).get('status')).toBe('in_progress')
    expect(new URLSearchParams(calls[1]?.search).get('page')).toBe('1')
  })

  it('getBug asks /portal/bugs/:id', async () => {
    const { calls } = stubFetch(() => json(bugFixture))
    await getBug(bugFixture.id)
    expect(calls[0]).toMatchObject({ method: 'GET', path: `/portal/bugs/${bugFixture.id}` })
  })

  it('changeBugStatus posts status and reason', async () => {
    const { calls } = stubFetch(() => json(bugFixture))
    await changeBugStatus(bugFixture.id, { status: 'wont_fix', reason: 'дубль' })
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/portal/bugs/${bugFixture.id}/status`, body: { status: 'wont_fix', reason: 'дубль' } })
  })

  it('rejects an answer of an unexpected shape', async () => {
    stubFetch(() => json({ nope: true }))
    await expect(getBug(bugFixture.id)).rejects.toMatchObject({ kind: 'unexpected' })
  })
})

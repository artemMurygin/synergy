import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { acceptRequest, takeRequest, type AcceptBody } from '@/features/decision/model/decision.api'
import { requestSchema } from '@/lib/schemas'
import { json, stubFetch } from '@/test/helpers'
import acceptBodies from './contract/accept-bodies.json'
import requestResponses from './contract/request-responses.json'

// The fixtures are verified against the real backend in
// backend/src/modules/portal/interface/http/portal-contract.spec.ts.
describe('backend contract', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(requestResponses.map((item) => [item.name, item.response] as const))(
    'requestSchema parses the backend response for %s',
    (_name, response) => {
      const parsed = requestSchema.safeParse(response)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
      expect(parsed.data).toEqual(response)
    }
  )

  it('keeps reviewer, takenAt and effortHours in parsed responses', () => {
    const taken = requestResponses.find((item) => item.name === 'under_review')?.response
    const parsed = requestSchema.parse(taken)
    expect(parsed.reviewer?.fullName).toBe('Петров Пётр')
    expect(parsed.takenAt).toBe('2026-11-07T09:00:00.000Z')
    const planned = requestSchema.parse(requestResponses.find((item) => item.name === 'planned')?.response)
    expect(planned.effortHours).toBe(16)
  })

  it.each(acceptBodies.map((item) => [item.name, item.body] as const))(
    'acceptRequest sends the body the backend accepts: %s',
    async (_name, body) => {
      useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
      const { calls } = stubFetch(() => json(requestResponses[0]?.response))
      await acceptRequest('r1', body as AcceptBody)
      expect(calls[0]?.body).toEqual(body)
    }
  )

  it('takeRequest parses the backend response', async () => {
    const { calls } = stubFetch(() => json(requestResponses[1]?.response))
    const result = await takeRequest('r1')
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/requests/r1/take' })
    expect(result.status.code).toBe('under_review')
  })
})

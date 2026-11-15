import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { ApiError } from '@/lib/errors'
import { GUIDES_KEY } from '@/lib/query-keys'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { getAgentGuide, saveAgentGuide } from './guides.api'
import { GUIDE_ARCHIVED_MESSAGE, GUIDE_ERROR_FALLBACK, GUIDE_NETWORK_MESSAGE, GUIDE_TOO_LONG_MESSAGE, guideErrorMessage } from './guides.errors'
import { emptyGuideFixture, guideFixture } from './guides.fixtures'
import { agentGuideQuery } from './guides.queries'
import { guideResponseSchema } from './guides.schema'
import { useSaveGuide } from './use-save-guide'

const AGENT = '3f0c2d9e-7a31-4c55-9a52-1f6d8b0e4a22'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('guideResponseSchema', () => {
  it('parses a filled guide', () => {
    expect(guideResponseSchema.parse(guideFixture)).toEqual(guideFixture)
  })

  it('parses an empty guide with all fields null', () => {
    expect(guideResponseSchema.parse(emptyGuideFixture)).toEqual({ body: null, updatedAt: null, updatedBy: null })
  })

  it('rejects a malformed body', () => {
    expect(guideResponseSchema.safeParse({ body: 1, updatedAt: null, updatedBy: null }).success).toBe(false)
  })
})

describe('api', () => {
  it('getAgentGuide requests GET /portal/agents/:id/guide', async () => {
    const { fn } = stubFetch(() => json(guideFixture))
    await expect(getAgentGuide(AGENT)).resolves.toEqual(guideFixture)
    expect(String(fn.mock.calls[0][0])).toContain(`/portal/agents/${AGENT}/guide`)
  })

  it('saveAgentGuide PUTs { body }', async () => {
    const { fn } = stubFetch(() => json(guideFixture))
    await saveAgentGuide(AGENT, '# Hi')
    const init = fn.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ body: '# Hi' })
  })
})

describe('agentGuideQuery', () => {
  it('key is GUIDES_KEY + agentId', () => {
    expect(agentGuideQuery(AGENT).queryKey).toEqual([...GUIDES_KEY, AGENT])
  })

  it('loads the guide', async () => {
    stubFetch(() => json(emptyGuideFixture))
    await expect(createTestClient().fetchQuery(agentGuideQuery(AGENT))).resolves.toEqual(emptyGuideFixture)
  })
})

describe('useSaveGuide', () => {
  it('on success puts the response into the cache', async () => {
    stubFetch(() => json(guideFixture))
    const client = createTestClient()
    const { result } = renderHook(() => useSaveGuide(AGENT), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync('# Hi'))
    expect(client.getQueryData(agentGuideQuery(AGENT).queryKey)).toEqual(guideFixture)
  })

  it('on deletion (empty body) caches the empty guide', async () => {
    stubFetch(() => json(emptyGuideFixture))
    const client = createTestClient()
    client.setQueryData(agentGuideQuery(AGENT).queryKey, guideFixture)
    const { result } = renderHook(() => useSaveGuide(AGENT), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync('   '))
    expect(client.getQueryData(agentGuideQuery(AGENT).queryKey)).toEqual(emptyGuideFixture)
  })
})

describe('guideErrorMessage', () => {
  it('409 archived', () => {
    expect(guideErrorMessage(new ApiError('conflict', 'x', 409, 'PORTAL_AGENT_ARCHIVED'))).toBe(GUIDE_ARCHIVED_MESSAGE)
    expect(GUIDE_ARCHIVED_MESSAGE).toBe('Агент в архиве')
  })

  it('400 too long', () => {
    expect(guideErrorMessage(new ApiError('bad_request', 'x', 400))).toBe(GUIDE_TOO_LONG_MESSAGE)
  })

  it('network', () => {
    expect(guideErrorMessage(new ApiError('unavailable', 'x'))).toBe(GUIDE_NETWORK_MESSAGE)
  })

  it('fallback', () => {
    expect(guideErrorMessage(new Error('boom'))).toBe(GUIDE_ERROR_FALLBACK)
    expect(guideErrorMessage(new ApiError('forbidden', 'x', 403))).toBe(GUIDE_ERROR_FALLBACK)
  })
})

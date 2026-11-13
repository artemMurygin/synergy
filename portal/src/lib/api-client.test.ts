import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApiClient } from './api-client'
import { ApiError } from './errors'

function stubFetch(response: Response | Error) {
  const fn = vi.fn((_url: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response.clone())
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api client', () => {
  const schema = z.object({ id: z.string() })

  it('calls baseUrl + path with credentials include', async () => {
    const fn = stubFetch(ok({ id: 'a' }))
    const client = createApiClient({ baseUrl: 'http://api.test', getAccessToken: () => null })
    await client.request('/portal/agents', { schema })
    const [url, init] = fn.mock.calls[0]!
    expect(url).toBe('http://api.test/portal/agents')
    expect(init?.credentials).toBe('include')
  })

  it('strips a trailing slash from the base address', async () => {
    const fn = stubFetch(ok({ id: 'a' }))
    const client = createApiClient({ baseUrl: 'http://api.test/', getAccessToken: () => null })
    await client.request('/x', { schema })
    expect(fn.mock.calls[0]![0]).toBe('http://api.test/x')
  })

  it('sends Authorization Bearer when a token exists and none otherwise', async () => {
    const fn = stubFetch(ok({ id: 'a' }))
    let token: string | null = 'tok'
    const client = createApiClient({ baseUrl: 'http://api.test', getAccessToken: () => token })
    await client.request('/x', { schema })
    expect(new Headers(fn.mock.calls[0]![1]?.headers).get('Authorization')).toBe('Bearer tok')
    token = null
    await client.request('/x', { schema })
    expect(new Headers(fn.mock.calls[1]![1]?.headers).has('Authorization')).toBe(false)
  })

  it('sends a JSON body with method and content type', async () => {
    const fn = stubFetch(ok({ id: 'a' }, 201))
    const client = createApiClient({ baseUrl: 'http://api.test', getAccessToken: () => null })
    await client.request('/portal/requests', { method: 'POST', body: { title: 'T' }, schema })
    const init = fn.mock.calls[0]![1]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"title":"T"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('appends query parameters and skips undefined ones', async () => {
    const fn = stubFetch(ok({ id: 'a' }))
    const client = createApiClient({ baseUrl: 'http://api.test', getAccessToken: () => null })
    await client.request('/portal/skills', { query: { status: 'planned', page: 1, limit: undefined }, schema })
    expect(fn.mock.calls[0]![0]).toBe('http://api.test/portal/skills?status=planned&page=1')
  })

  it('returns undefined for 204 without a schema', async () => {
    stubFetch(new Response(null, { status: 204 }))
    const client = createApiClient({ baseUrl: 'http://api.test', getAccessToken: () => null })
    await expect(client.request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('throws a typed ApiError for non-2xx', async () => {
    stubFetch(ok({ message: 'нет' }, 404))
    const client = createApiClient({ baseUrl: 'http://api.test', getAccessToken: () => null })
    const error = await client.request('/x', { schema }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('not_found')
  })

  it('throws unavailable when the network fails', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    const client = createApiClient({ baseUrl: 'http://api.test', getAccessToken: () => null })
    const error = await client.request('/x', { schema }).catch((e: unknown) => e)
    expect((error as ApiError).kind).toBe('unavailable')
  })

  it('throws unexpected when the body does not match the schema', async () => {
    stubFetch(ok({ id: 5 }))
    const client = createApiClient({ baseUrl: 'http://api.test', getAccessToken: () => null })
    const error = await client.request('/x', { schema }).catch((e: unknown) => e)
    expect((error as ApiError).kind).toBe('unexpected')
  })
})

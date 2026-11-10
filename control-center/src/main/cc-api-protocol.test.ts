import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  net: { fetch: fetchMock },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() }
}))

import { forward, type ProxyAuthPort } from './cc-api-protocol'
import { AccessToken } from './auth/domain/access-token'
import { AuthError } from './auth/domain/auth-error'

const BACKEND = 'http://localhost:3000'

interface FakeAuth extends ProxyAuthPort {
  getAccessToken: ReturnType<typeof vi.fn<ProxyAuthPort['getAccessToken']>>
  refresh: ReturnType<typeof vi.fn<ProxyAuthPort['refresh']>>
  markPasswordChangeRequired: ReturnType<typeof vi.fn<ProxyAuthPort['markPasswordChangeRequired']>>
  getSessionSignal: ReturnType<typeof vi.fn<ProxyAuthPort['getSessionSignal']>>
}

let sessionController = new AbortController()

function createAuth(): FakeAuth {
  return {
    getAccessToken: vi.fn<ProxyAuthPort['getAccessToken']>().mockResolvedValue('access-1'),
    refresh: vi.fn<ProxyAuthPort['refresh']>().mockRejectedValue(new Error('refresh not expected')),
    markPasswordChangeRequired: vi.fn<ProxyAuthPort['markPasswordChangeRequired']>(),
    getSessionSignal: vi.fn<ProxyAuthPort['getSessionSignal']>(() => sessionController.signal)
  }
}

function createAccessToken(): AccessToken {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return AccessToken.parse(`${encode({ alg: 'none' })}.${encode({ exp: 4_102_444_800 })}.signature`)
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function headersOf(callIndex: number): Headers {
  return new Headers(fetchMock.mock.calls[callIndex][1].headers)
}

describe('forward', () => {
  let auth: FakeAuth

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('ok'))
    sessionController = new AbortController()
    auth = createAuth()
  })

  it('rewrites the URL to the backend, keeping path and query', async () => {
    await forward(new Request('cc-api://backend/threads?x=1'), BACKEND, auth)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/threads?x=1')
  })

  it('forwards method, headers and body for POST with duplex half', async () => {
    const body = JSON.stringify({ threadId: 't1' })
    await forward(
      new Request('cc-api://backend/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body
      }),
      BACKEND,
      auth
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.duplex).toBe('half')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(new Headers(init.headers).get('accept')).toBe('text/event-stream')
    expect(await new Response(init.body).text()).toBe(body)
  })

  it('returns the streaming response without buffering', async () => {
    const encoder = new TextEncoder()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
      }
    })
    const upstream = new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    fetchMock.mockResolvedValue(upstream)

    const res = await forward(new Request('cc-api://backend/agent'), BACKEND, auth)
    expect(res).toBe(upstream)

    const reader = res.body!.getReader()
    controller.enqueue(encoder.encode('data: 1\n\n'))
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe('data: 1\n\n')
    controller.enqueue(encoder.encode('data: 2\n\n'))
    const second = await reader.read()
    expect(new TextDecoder().decode(second.value)).toBe('data: 2\n\n')
    controller.close()
  })

  it('returns 502 with a JSON message on network error', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const res = await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toContain('application/json')
    const json = await res.json()
    expect(typeof json.message).toBe('string')
    expect(json.message).not.toContain('ECONNREFUSED')
    expect(json.message).not.toContain(BACKEND)
  })

  it('does not follow redirects', async () => {
    await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual')
  })

  it('drops hop-by-hop and sensitive headers', async () => {
    await forward(
      new Request('cc-api://backend/threads', {
        headers: { authorization: 'Bearer x', cookie: 'a=b', host: 'evil', connection: 'close', accept: 'application/json' }
      }),
      BACKEND,
      auth
    )
    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    for (const name of ['cookie', 'host', 'connection']) expect(headers.has(name)).toBe(false)
    expect(headers.get('authorization')).toBe('Bearer access-1')
    expect(headers.get('accept')).toBe('application/json')
  })

  it.each(['/tasks', '/tasks/abc?status=todo', '/tasks/abc/attachments/def', '/users?search=an'])(
    'allows path %s',
    async (path) => {
      await forward(new Request(`cc-api://backend${path}`), BACKEND, auth)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:3000${path}`)
    }
  )

  it('keeps the multipart content-type with its boundary', async () => {
    const form = new FormData()
    form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'a.txt')
    await forward(new Request('cc-api://backend/tasks/t1/attachments', { method: 'POST', body: form }), BACKEND, auth)
    const [, init] = fetchMock.mock.calls[0]
    expect(new Headers(init.headers).get('content-type')).toMatch(/^multipart\/form-data; boundary=.+/)
    expect(await new Response(init.body).text()).toContain('hello')
  })

  it('returns a binary response body unchanged', async () => {
    const bytes = new Uint8Array([0, 255, 1, 128])
    fetchMock.mockResolvedValue(
      new Response(bytes, { headers: { 'content-disposition': "attachment; filename*=UTF-8''a.bin" } })
    )
    const res = await forward(new Request('cc-api://backend/tasks/t1/attachments/a1'), BACKEND, auth)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
    expect(res.headers.get('content-disposition')).toContain('a.bin')
  })

  it.each(['/other', '/taskss', '/usersx', '/admin/tasks', '/threadsx', '/admin/threads'])('rejects path %s with 403', async (path) => {
    const res = await forward(new Request(`cc-api://backend${path}`), BACKEND, auth)
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a host other than backend with 400', async () => {
    const res = await forward(new Request('cc-api://evil/threads'), BACKEND, auth)
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds the bearer token and requests it with a 30 second minimum ttl', async () => {
    await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(auth.getAccessToken).toHaveBeenCalledWith(30_000)
    expect(headersOf(0).get('authorization')).toBe('Bearer access-1')
  })

  it('replaces a renderer supplied authorization header with the main one', async () => {
    await forward(new Request('cc-api://backend/threads', { headers: { authorization: 'Bearer forged' } }), BACKEND, auth)
    expect(headersOf(0).get('authorization')).toBe('Bearer access-1')
  })

  it('drops the x-client-type header from the renderer', async () => {
    await forward(new Request('cc-api://backend/threads', { headers: { 'x-client-type': 'web' } }), BACKEND, auth)
    expect(headersOf(0).has('x-client-type')).toBe(false)
  })

  it('answers 401 JSON without calling the backend when there is no session', async () => {
    auth.getAccessToken.mockResolvedValue(null)
    const res = await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps /auth closed even with a session', async () => {
    const res = await forward(new Request('cc-api://backend/auth/login', { method: 'POST', body: '{}' }), BACKEND, auth)
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes once on 401 TOKEN_EXPIRED and retries with the new token and the same body', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    const refreshed = createAccessToken()
    auth.refresh.mockResolvedValue(refreshed)
    const body = JSON.stringify({ title: 'x' })

    const res = await forward(
      new Request('cc-api://backend/threads', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
      BACKEND,
      auth
    )

    expect(res.status).toBe(200)
    expect(auth.refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(headersOf(1).get('authorization')).toBe(`Bearer ${refreshed.value}`)
    expect(await new Response(fetchMock.mock.calls[0][1].body).text()).toBe(body)
    expect(await new Response(fetchMock.mock.calls[1][1].body).text()).toBe(body)
  })

  it('does not retry a second time when the retry is also 401 TOKEN_EXPIRED', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { code: 'TOKEN_EXPIRED' }))
    auth.refresh.mockResolvedValue(createAccessToken())
    const res = await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(res.status).toBe(401)
    expect(auth.refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns the original 401 when refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'TOKEN_EXPIRED' }))
    auth.refresh.mockRejectedValue(new AuthError('TOKEN_INVALID'))
    const res = await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('TOKEN_EXPIRED')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['another 401 code', 401, { code: 'TOKEN_INVALID' }],
    ['500', 500, { code: 'TOKEN_EXPIRED' }],
    ['403 other code', 403, { code: 'FORBIDDEN' }]
  ])('does not refresh on %s', async (_label, status, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, body))
    const res = await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(res.status).toBe(status)
    expect(auth.refresh).not.toHaveBeenCalled()
    expect(auth.markPasswordChangeRequired).not.toHaveBeenCalled()
  })

  it('passes 401 with a non JSON body through without refreshing', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }))
    const res = await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('nope')
    expect(auth.refresh).not.toHaveBeenCalled()
  })

  it('passes 403 PASSWORD_CHANGE_REQUIRED through intact and marks the session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { code: 'PASSWORD_CHANGE_REQUIRED', message: 'change it' }))
    const res = await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'change it' })
    expect(auth.markPasswordChangeRequired).toHaveBeenCalledTimes(1)
    expect(auth.refresh).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('passes the session signal to the backend request', async () => {
    await forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    const signal: AbortSignal = fetchMock.mock.calls[0][1].signal
    expect(signal.aborted).toBe(false)
    sessionController.abort()
    expect(signal.aborted).toBe(true)
  })

  it('aborts the backend request when the renderer request is aborted', async () => {
    const controller = new AbortController()
    await forward(new Request('cc-api://backend/threads', { signal: controller.signal }), BACKEND, auth)
    const signal: AbortSignal = fetchMock.mock.calls[0][1].signal
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  it('rejects a pending request when the session signal aborts', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const pending = forward(new Request('cc-api://backend/threads'), BACKEND, auth)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    sessionController.abort()
    const res = await pending
    expect(res.status).toBe(502)
  })

  it('streams the /agent response with a token and does not read the upstream body', async () => {
    const upstream = new Response(new ReadableStream<Uint8Array>({ start() {} }), {
      headers: { 'content-type': 'text/event-stream' }
    })
    fetchMock.mockResolvedValue(upstream)
    const res = await forward(new Request('cc-api://backend/agent', { method: 'POST', body: '{}' }), BACKEND, auth)
    expect(res).toBe(upstream)
    expect(upstream.bodyUsed).toBe(false)
  })
})

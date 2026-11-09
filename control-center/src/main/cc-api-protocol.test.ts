import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  net: { fetch: fetchMock },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() }
}))

import { forward } from './cc-api-protocol'

const BACKEND = 'http://localhost:3000'

describe('forward', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('ok'))
  })

  it('rewrites the URL to the backend, keeping path and query', async () => {
    await forward(new Request('cc-api://backend/threads?x=1'), BACKEND)
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
      BACKEND
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

    const res = await forward(new Request('cc-api://backend/agent'), BACKEND)
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
    const res = await forward(new Request('cc-api://backend/threads'), BACKEND)
    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toContain('application/json')
    const json = await res.json()
    expect(typeof json.message).toBe('string')
    expect(json.message).not.toContain('ECONNREFUSED')
    expect(json.message).not.toContain(BACKEND)
  })

  it('does not follow redirects', async () => {
    await forward(new Request('cc-api://backend/threads'), BACKEND)
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual')
  })

  it('drops hop-by-hop and sensitive headers', async () => {
    await forward(
      new Request('cc-api://backend/threads', {
        headers: { authorization: 'Bearer x', cookie: 'a=b', host: 'evil', connection: 'close', accept: 'application/json' }
      }),
      BACKEND
    )
    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    for (const name of ['authorization', 'cookie', 'host', 'connection']) expect(headers.has(name)).toBe(false)
    expect(headers.get('accept')).toBe('application/json')
  })

  it.each(['/other', '/threadsx', '/admin/threads'])('rejects path %s with 403', async (path) => {
    const res = await forward(new Request(`cc-api://backend${path}`), BACKEND)
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a host other than backend with 400', async () => {
    const res = await forward(new Request('cc-api://evil/threads'), BACKEND)
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

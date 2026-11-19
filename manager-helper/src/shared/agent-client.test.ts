import { HttpAgent } from '@ag-ui/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AskError } from './api'
import { clearAccessToken, setAccessToken } from './auth/access-token-store'
import { getAuthState, resetAuthState, setAuthState } from './auth/auth-state'
import { listThreads } from './threads-api'
import { RunConflictError, cancelRun, createAgent, isRunConflict } from './agent-client'

vi.mock('./settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

type Sender = (url: string, init?: RequestInit) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn<Sender>>

function firstInit(): RequestInit {
  return fetchMock.mock.calls[0]?.[1] ?? {}
}

beforeEach(() => {
  fetchMock = vi.fn<Sender>()
  vi.stubGlobal('fetch', fetchMock)
  setAccessToken('tok')
})
afterEach(() => {
  clearAccessToken()
  resetAuthState()
  vi.unstubAllGlobals()
})

describe('createAgent', () => {
  it('builds an HttpAgent on <backendUrl>/agent bound to the thread', async () => {
    const agent = await createAgent('t1')
    expect(agent).toBeInstanceOf(HttpAgent)
    expect(agent.url).toBe('http://api.test/agent')
    expect(agent.threadId).toBe('t1')
  })
})

describe('createAgent runs', () => {
  const input = (forwardedProps: Record<string, unknown>) => ({
    threadId: 't1',
    runId: 'r1',
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps,
  })

  it('lifts the attached file ids to forwardedProps.fileIds (withFileIds)', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }))
    const agent = await createAgent('t1')
    await new Promise<void>((resolve) => {
      agent.run(input({ runConfig: { fileIds: ['f1', 'f2'] } })).subscribe({
        error: () => {
          resolve()
        },
      })
    })
    const body: unknown = JSON.parse(await new Response(firstInit().body).text())
    expect(body).toMatchObject({ forwardedProps: { fileIds: ['f1', 'f2'] } })
  })

  it('turns a network failure into a text that points at the extension settings', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const agent = await createAgent('t1')
    const error = await new Promise<unknown>((resolve) => {
      agent.run(input({})).subscribe({ error: resolve })
    })
    expect(error).toBeInstanceOf(AskError)
    expect(error).toHaveProperty('message', expect.stringContaining('настройках расширения'))
  })

  it('turns HTTP 409 into a run conflict with a ready text', async () => {
    fetchMock.mockResolvedValue(new Response('busy', { status: 409 }))
    const agent = await createAgent('t1')
    const error = await new Promise<unknown>((resolve) => {
      agent.run(input({})).subscribe({ error: resolve })
    })
    expect(isRunConflict(error)).toBe(true)
    expect(error).toHaveProperty('message', expect.stringContaining('агент ещё отвечает'))
  })
})

describe('cancelRun', () => {
  it('posts to /threads/:id/run/cancel and accepts 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(cancelRun('t1')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/threads/t1/run/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('encodes the thread id', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await cancelRun('a/b')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/threads/a%2Fb/run/cancel',
      expect.anything(),
    )
  })

  it('does not fail on 404 (nothing to cancel)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }))
    await expect(cancelRun('t1')).resolves.toBeUndefined()
  })

  it('throws AskError with the server message on 500', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'boom' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(cancelRun('t1')).rejects.toThrow('boom')
  })

  it('throws AskError on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    await expect(cancelRun('t1')).rejects.toBeInstanceOf(AskError)
  })
})

describe('isRunConflict', () => {
  it('recognises HTTP 409 from the agent and RunConflictError', () => {
    expect(isRunConflict(new Error('HTTP 409: {"message":"busy"}'))).toBe(true)
    expect(isRunConflict('HTTP 409: busy')).toBe(true)
    expect(isRunConflict(new RunConflictError('busy'))).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isRunConflict(new Error('HTTP 500: boom'))).toBe(false)
    expect(isRunConflict(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('authorization', () => {
  const forbidden = () =>
    new Response(JSON.stringify({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'change' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })

  it('sends the agent request with the bearer token', async () => {
    setAccessToken('tok')
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    const agent = await createAgent('t1')
    await agent.fetch('http://api.test/agent', { method: 'POST' })
    const headers = new Headers(firstInit().headers)
    expect(headers.get('authorization')).toBe('Bearer tok')
  })

  it('cancelRun sends the bearer token', async () => {
    setAccessToken('tok')
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await cancelRun('t1')
    const headers = new Headers(firstInit().headers)
    expect(headers.get('authorization')).toBe('Bearer tok')
  })

  it('PASSWORD_CHANGE_REQUIRED moves the session to must-change-password', async () => {
    setAccessToken('tok')
    setAuthState({ status: 'authenticated' })
    fetchMock.mockResolvedValue(forbidden())
    await expect(cancelRun('t1')).rejects.toThrow('change')
    expect(getAuthState().status).toBe('must-change-password')
  })
})

describe('X-Client-App', () => {
  it('sends employee-app on agent requests', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    const agent = await createAgent('t1')
    await agent.fetch('http://api.test/agent', { method: 'POST' })
    expect(new Headers(firstInit().headers).get('x-client-app')).toBe('employee-app')
  })

  it('sends employee-app on cancelRun', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await cancelRun('t1')
    expect(new Headers(firstInit().headers).get('x-client-app')).toBe('employee-app')
  })

  it('sends employee-app on chat requests', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }))
    await listThreads()
    expect(new Headers(firstInit().headers).get('x-client-app')).toBe('employee-app')
  })
})

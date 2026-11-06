import { HttpAgent } from '@ag-ui/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AskError } from './api'
import { RunConflictError, cancelRun, createAgent, isRunConflict } from './agent-client'

vi.mock('./settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
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

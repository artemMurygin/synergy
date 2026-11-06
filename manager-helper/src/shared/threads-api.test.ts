import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from './auth/access-token-store'
import { getAuthState, resetAuthState, setAuthState } from './auth/auth-state'
import { AskError } from './api'
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  renameThread,
  ThreadNotFoundError,
} from './threads-api'

vi.mock('./settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

const thread = {
  id: 't1',
  title: 'Новый чат',
  titleIsCustom: false,
  createdAt: '2026-11-05T10:00:00.000Z',
  lastActivityAt: '2026-11-05T11:00:00.000Z',
  running: false,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

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

function lastCall(): { url: string; init: RequestInit } {
  const call: unknown[] = fetchMock.mock.calls.at(-1) ?? []
  const [url, init] = call
  return {
    url: typeof url === 'string' ? url : '',
    init: typeof init === 'object' && init !== null ? init : {},
  }
}

describe('listThreads', () => {
  it('requests /threads and parses threads with the running flag', async () => {
    fetchMock.mockResolvedValue(json([thread, { ...thread, id: 't2', running: true }]))
    const result = await listThreads()
    expect(lastCall().url).toBe('http://api.test/threads')
    expect(result.map((t) => [t.id, t.running])).toEqual([
      ['t1', false],
      ['t2', true],
    ])
  })

  it('treats a missing running flag as false', async () => {
    fetchMock.mockResolvedValue(
      json([
        {
          id: thread.id,
          title: thread.title,
          titleIsCustom: thread.titleIsCustom,
          createdAt: thread.createdAt,
          lastActivityAt: thread.lastActivityAt,
        },
      ]),
    )
    await expect(listThreads()).resolves.toEqual([thread])
  })

  it('throws AskError on an unexpected body', async () => {
    fetchMock.mockResolvedValue(json({ nope: true }))
    await expect(listThreads()).rejects.toBeInstanceOf(AskError)
  })

  it('throws AskError with the server message on 500', async () => {
    fetchMock.mockResolvedValue(json({ message: 'boom' }, 500))
    await expect(listThreads()).rejects.toThrow('boom')
  })

  it('throws AskError on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    await expect(listThreads()).rejects.toBeInstanceOf(AskError)
  })
})

describe('createThread', () => {
  it('posts the optional title', async () => {
    fetchMock.mockResolvedValue(json(thread, 201))
    await expect(createThread('Тема')).resolves.toEqual(thread)
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/threads')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ title: 'Тема' }))
  })

  it('posts an empty object without a title', async () => {
    fetchMock.mockResolvedValue(json(thread, 201))
    await createThread()
    expect(lastCall().init.body).toBe('{}')
  })
})

describe('getThread', () => {
  it('returns AG-UI messages and the running flag', async () => {
    const messages = [
      { id: 'm1', role: 'user', content: 'Привет' },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Ищу',
        toolCalls: [
          { id: 'c1', type: 'function', function: { name: 'search', arguments: '{"q":1}' } },
        ],
      },
      { id: 'm3', role: 'tool', toolCallId: 'c1', content: 'ok' },
    ]
    fetchMock.mockResolvedValue(json({ messages, running: true }))
    const result = await getThread('t1')
    expect(lastCall().url).toBe('http://api.test/threads/t1/messages')
    expect(result).toEqual({ messages, running: true })
  })

  it('encodes the id in the path', async () => {
    fetchMock.mockResolvedValue(json({ messages: [], running: false }))
    await getThread('a/b')
    expect(lastCall().url).toBe('http://api.test/threads/a%2Fb/messages')
  })

  it('throws AskError on an unexpected body', async () => {
    fetchMock.mockResolvedValue(json({ messages: 'x' }))
    await expect(getThread('t1')).rejects.toBeInstanceOf(AskError)
  })

  it('throws ThreadNotFoundError (an AskError) on 404', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Чат не найден' }, 404))
    const error = await getThread('zzz').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ThreadNotFoundError)
    expect(error).toBeInstanceOf(AskError)
  })
})

describe('renameThread', () => {
  it('patches the title', async () => {
    fetchMock.mockResolvedValue(json({ ...thread, title: 'Новое', titleIsCustom: true }))
    const result = await renameThread('t1', 'Новое')
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/threads/t1')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ title: 'Новое' }))
    expect(result.title).toBe('Новое')
  })

  it('surfaces a 400 validation message', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Название слишком длинное' }, 400))
    await expect(renameThread('t1', 'x')).rejects.toThrow('Название слишком длинное')
  })
})

describe('deleteThread', () => {
  it('sends DELETE and accepts 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteThread('t1')).resolves.toBeUndefined()
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/threads/t1')
    expect(init.method).toBe('DELETE')
  })

  it('throws ThreadNotFoundError on 404', async () => {
    fetchMock.mockResolvedValue(json({ message: 'нет' }, 404))
    await expect(deleteThread('t1')).rejects.toBeInstanceOf(ThreadNotFoundError)
  })
})

describe('authorization', () => {
  it('sends requests with the bearer token', async () => {
    setAccessToken('tok')
    fetchMock.mockResolvedValue(json([thread]))
    await listThreads()
    const headers = new Headers(firstInit().headers)
    expect(headers.get('authorization')).toBe('Bearer tok')
  })

  it('PASSWORD_CHANGE_REQUIRED moves the session to must-change-password', async () => {
    setAccessToken('tok')
    setAuthState({ status: 'authenticated' })
    fetchMock.mockResolvedValue(json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'change' }, 403))
    await expect(listThreads()).rejects.toThrow(AskError)
    expect(getAuthState().status).toBe('must-change-password')
  })
})

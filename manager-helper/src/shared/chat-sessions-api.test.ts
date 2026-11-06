import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askAgent, AskError } from './api'
import {
  createSession,
  deleteSession,
  getMessages,
  listSessions,
  renameSession,
  SessionNotFoundError,
} from './chat-sessions-api'

vi.mock('./settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

const session = {
  id: 's1',
  title: 'Новый чат',
  titleIsCustom: false,
  createdAt: '2026-11-05T10:00:00.000Z',
  lastActivityAt: '2026-11-05T11:00:00.000Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
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

describe('listSessions', () => {
  it('requests the list and parses sessions', async () => {
    fetchMock.mockResolvedValue(json([session]))
    await expect(listSessions()).resolves.toEqual([session])
    expect(lastCall().url).toBe('http://api.test/chat-sessions')
  })

  it('throws AskError on an unexpected body', async () => {
    fetchMock.mockResolvedValue(json({ nope: true }))
    await expect(listSessions()).rejects.toBeInstanceOf(AskError)
  })

  it('throws AskError with the server message on 500', async () => {
    fetchMock.mockResolvedValue(json({ message: 'boom' }, 500))
    await expect(listSessions()).rejects.toThrow('boom')
  })

  it('throws AskError on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    await expect(listSessions()).rejects.toBeInstanceOf(AskError)
  })
})

describe('createSession', () => {
  it('posts the optional title', async () => {
    fetchMock.mockResolvedValue(json(session, 201))
    await expect(createSession('Тема')).resolves.toEqual(session)
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/chat-sessions')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ title: 'Тема' }))
  })

  it('posts an empty object without a title', async () => {
    fetchMock.mockResolvedValue(json(session, 201))
    await createSession()
    expect(lastCall().init.body).toBe('{}')
  })
})

describe('getMessages', () => {
  it('parses user and agent messages with tool calls', async () => {
    fetchMock.mockResolvedValue(
      json([
        { id: 1, sessionId: 's1', role: 'user', text: 'Привет', createdAt: 'x' },
        {
          id: 2,
          sessionId: 's1',
          role: 'agent',
          text: 'Ответ',
          toolCalls: [{ name: 'search', args: { q: 1 } }],
          durationMs: 1200,
          createdAt: 'x',
        },
      ]),
    )
    const messages = await getMessages('s1')
    expect(lastCall().url).toBe('http://api.test/chat-sessions/s1/messages')
    expect(messages).toEqual([
      { id: 1, role: 'user', text: 'Привет' },
      {
        id: 2,
        role: 'agent',
        text: 'Ответ',
        toolCalls: [{ name: 'search', args: { q: 1 } }],
        durationMs: 1200,
      },
    ])
  })

  it('defaults missing agent fields', async () => {
    fetchMock.mockResolvedValue(json([{ id: '7', role: 'agent', text: 'A' }]))
    await expect(getMessages('s1')).resolves.toEqual([
      { id: 7, role: 'agent', text: 'A', toolCalls: [], durationMs: 0 },
    ])
  })

  it('throws SessionNotFoundError (an AskError) on 404', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Чат не найден' }, 404))
    const error = await getMessages('zzz').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SessionNotFoundError)
    expect(error).toBeInstanceOf(AskError)
  })
})

describe('renameSession', () => {
  it('patches the title', async () => {
    fetchMock.mockResolvedValue(json({ ...session, title: 'Новое', titleIsCustom: true }))
    const result = await renameSession('s1', 'Новое')
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/chat-sessions/s1')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ title: 'Новое' }))
    expect(result.title).toBe('Новое')
  })

  it('surfaces a 400 validation message', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Название слишком длинное' }, 400))
    await expect(renameSession('s1', 'x')).rejects.toThrow('Название слишком длинное')
  })
})

describe('deleteSession', () => {
  it('sends DELETE and accepts 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteSession('s1')).resolves.toBeUndefined()
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/chat-sessions/s1')
    expect(init.method).toBe('DELETE')
  })

  it('throws SessionNotFoundError on 404', async () => {
    fetchMock.mockResolvedValue(json({ message: 'нет' }, 404))
    await expect(deleteSession('s1')).rejects.toBeInstanceOf(SessionNotFoundError)
  })
})

describe('askAgent', () => {
  it('sends question and sessionId', async () => {
    fetchMock.mockResolvedValue(json({ answer: 'ok', toolCalls: [], durationMs: 5 }))
    await expect(askAgent('вопрос', 's1')).resolves.toEqual({
      answer: 'ok',
      toolCalls: [],
      durationMs: 5,
    })
    expect(lastCall().init.body).toBe(JSON.stringify({ question: 'вопрос', sessionId: 's1' }))
  })

  it('throws SessionNotFoundError when the session is unknown (404)', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Чат не найден' }, 404))
    await expect(askAgent('q', 'gone')).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('throws a plain AskError for other failures', async () => {
    fetchMock.mockResolvedValue(json({ message: 'timeout' }, 504))
    const error = await askAgent('q', 's1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AskError)
    expect(error).not.toBeInstanceOf(SessionNotFoundError)
  })
})

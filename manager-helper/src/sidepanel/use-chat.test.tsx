import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { askAgent, AskError } from '@/shared/api'
import type { AskResponse } from '@/shared/api'
import { getMessages } from '@/shared/chat-sessions-api'
import type { StoredMessage } from '@/shared/chat-sessions-api'
import type * as ApiModule from '@/shared/api'
import { useChat } from './use-chat'

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  askAgent: vi.fn(),
}))
vi.mock('@/shared/chat-sessions-api')

const HISTORY: StoredMessage[] = [
  { id: 1, role: 'user', text: 'вопрос' },
  { id: 2, role: 'agent', text: 'ответ', toolCalls: [], durationMs: 10 },
]

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const answer = (text: string): AskResponse => ({ answer: text, toolCalls: [], durationMs: 5 })

beforeEach(() => {
  vi.mocked(getMessages).mockResolvedValue([])
})

describe('useChat(sessionId)', () => {
  it('loads history from the server', async () => {
    vi.mocked(getMessages).mockResolvedValue(HISTORY)
    const { result } = renderHook(() => useChat('s1'))
    expect(result.current.historyStatus).toBe('loading')
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    expect(getMessages).toHaveBeenCalledWith('s1')
    expect(result.current.messages.map((m) => m.text)).toEqual(['вопрос', 'ответ'])
  })

  it('is idle and empty without a session', () => {
    const { result } = renderHook(() => useChat(null))
    expect(result.current.historyStatus).toBe('idle')
    expect(result.current.messages).toEqual([])
    expect(getMessages).not.toHaveBeenCalled()
  })

  it('reports a history error', async () => {
    vi.mocked(getMessages).mockRejectedValue(new AskError('down'))
    const { result } = renderHook(() => useChat('s1'))
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('error')
    })
  })

  it('send appends question and answer and blocks while pending', async () => {
    const reply = deferred<AskResponse>()
    vi.mocked(askAgent).mockReturnValue(reply.promise)
    const { result } = renderHook(() => useChat('s1'))
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    act(() => {
      void result.current.send('  привет  ')
    })
    expect(result.current.pending).toBe(true)
    expect(result.current.messages.map((m) => m.text)).toEqual(['привет'])
    expect(askAgent).toHaveBeenCalledWith('привет', 's1', expect.any(AbortSignal))

    await act(async () => {
      await result.current.send('второй')
    })
    expect(askAgent).toHaveBeenCalledTimes(1)

    await act(async () => {
      reply.resolve(answer('готово'))
      await reply.promise
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'agent'])
  })

  it('ignores empty questions and a missing session', async () => {
    const { result } = renderHook(() => useChat('s1'))
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    await act(async () => {
      await result.current.send('   ')
    })
    const none = renderHook(() => useChat(null))
    await act(async () => {
      await none.result.current.send('вопрос')
    })
    expect(askAgent).not.toHaveBeenCalled()
  })

  it('an error keeps history, shows an error message and unblocks sending', async () => {
    vi.mocked(getMessages).mockResolvedValue(HISTORY)
    vi.mocked(askAgent).mockRejectedValueOnce(new AskError('сервер упал'))
    const { result } = renderHook(() => useChat('s1'))
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    await act(async () => {
      await result.current.send('ещё')
    })
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'agent', 'user', 'error'])
    expect(result.current.messages.at(-1)?.text).toBe('сервер упал')
    expect(result.current.pending).toBe(false)

    vi.mocked(askAgent).mockResolvedValueOnce(answer('ok'))
    await act(async () => {
      await result.current.send('ещё раз')
    })
    expect(result.current.messages.at(-1)?.role).toBe('agent')
  })

  it('an answer after switching stays out of the new chat and is in the old one on return', async () => {
    const reply = deferred<AskResponse>()
    vi.mocked(askAgent).mockReturnValue(reply.promise)
    vi.mocked(getMessages).mockImplementation((id) =>
      Promise.resolve(id === 'b' ? [{ id: 9, role: 'user', text: 'чат B' }] : []),
    )
    const { result, rerender } = renderHook(({ id }) => useChat(id), {
      initialProps: { id: 'a' },
    })
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    act(() => {
      void result.current.send('вопрос в A')
    })

    rerender({ id: 'b' })
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.text)).toEqual(['чат B'])
    })
    expect(result.current.pending).toBe(false)

    await act(async () => {
      reply.resolve(answer('ответ A'))
      await reply.promise
    })
    expect(result.current.messages.map((m) => m.text)).toEqual(['чат B'])

    // The server stored the answer; coming back loads it.
    vi.mocked(getMessages).mockImplementation(() =>
      Promise.resolve([
        { id: 1, role: 'user', text: 'вопрос в A' },
        { id: 2, role: 'agent', text: 'ответ A', toolCalls: [], durationMs: 5 },
      ]),
    )
    rerender({ id: 'a' })
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.text)).toEqual(['вопрос в A', 'ответ A'])
    })
  })

  it('keeps the answer that arrives while the history of that chat is reloading after a return', async () => {
    const reply = deferred<AskResponse>()
    vi.mocked(askAgent).mockReturnValue(reply.promise)
    vi.mocked(getMessages).mockImplementation((id) =>
      Promise.resolve(id === 'b' ? [{ id: 9, role: 'user', text: 'чат B' }] : []),
    )
    const { result, rerender } = renderHook(({ id }) => useChat(id), {
      initialProps: { id: 'a' },
    })
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    act(() => {
      void result.current.send('вопрос в A')
    })
    rerender({ id: 'b' })
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.text)).toEqual(['чат B'])
    })

    // Back to A: the GET is still in flight when the answer arrives; it was issued before the
    // server stored the answer, so it only holds the question.
    const staleHistory = deferred<StoredMessage[]>()
    vi.mocked(getMessages).mockReset()
    vi.mocked(getMessages).mockReturnValueOnce(staleHistory.promise)
    vi.mocked(getMessages).mockResolvedValue([
      { id: 1, role: 'user', text: 'вопрос в A' },
      { id: 2, role: 'agent', text: 'ответ A', toolCalls: [], durationMs: 5 },
    ])
    rerender({ id: 'a' })
    await act(async () => {
      reply.resolve(answer('ответ A'))
      await reply.promise
    })
    await act(async () => {
      staleHistory.resolve([{ id: 1, role: 'user', text: 'вопрос в A' }])
      await staleHistory.promise
    })
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.text)).toEqual(['вопрос в A', 'ответ A'])
    })
    expect(result.current.pending).toBe(false)
  })

  it('pending is tracked per chat while the request of another chat is in flight', async () => {
    const reply = deferred<AskResponse>()
    vi.mocked(askAgent).mockReturnValue(reply.promise)
    const { result, rerender } = renderHook(({ id }) => useChat(id), { initialProps: { id: 'a' } })
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    act(() => {
      void result.current.send('q')
    })
    rerender({ id: 'b' })
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    expect(result.current.pending).toBe(false)
    rerender({ id: 'a' })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      reply.resolve(answer('x'))
      await reply.promise
    })
  })

  it('does not carry messages from one chat to another', async () => {
    vi.mocked(getMessages).mockImplementation((id) => Promise.resolve(id === 'a' ? HISTORY : []))
    const { result, rerender } = renderHook(({ id }) => useChat(id), { initialProps: { id: 'a' } })
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })
    rerender({ id: 'b' })
    expect(result.current.messages).toEqual([])
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    expect(result.current.messages).toEqual([])
  })

  it('calls onSettled after an answer', async () => {
    vi.mocked(askAgent).mockResolvedValue(answer('ok'))
    const onSettled = vi.fn()
    const { result } = renderHook(() => useChat('s1', { onSettled }))
    await waitFor(() => {
      expect(result.current.historyStatus).toBe('ready')
    })
    await act(async () => {
      await result.current.send('q')
    })
    expect(onSettled).toHaveBeenCalledWith('s1')
  })
})

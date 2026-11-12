import './test-env'
import { EventType } from '@ag-ui/client'
import type { BaseEvent } from '@ag-ui/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgent } from '@/lib/backend/agent'
import * as filesApi from '@/lib/backend/files.api'
import type { StoredFile } from '@/lib/backend/files.schema'
import { cancelRun, getThreadHistory, listThreads } from '@/lib/backend/threads.api'
import { useChatStore } from '@/stores/chat.store'
import { ChatThread } from './ChatThread'
import { FakeAgent } from './fake-agent'

vi.mock('@/lib/backend/agent')
vi.mock('@/lib/backend/threads.api')
vi.mock('@/lib/backend/files.api')

afterEach(cleanup)

let agent: FakeAgent

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ChatThread />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

const input = () => screen.getByPlaceholderText('Вопрос агенту') as HTMLTextAreaElement

function emit(event: BaseEvent & Record<string, unknown>) {
  act(() => {
    agent.stream.next(event)
    // the real stream completes after the run ends
    if (event.type === EventType.RUN_FINISHED) agent.stream.complete()
  })
}

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await screen.findByPlaceholderText('Вопрос агенту')
  await user.type(input(), `${text}{Enter}`)
  await waitFor(() => {
    expect(agent.inputs.length).toBeGreaterThan(0)
  })
}

beforeEach(() => {
  agent = new FakeAgent({ url: 'cc-api://backend/agent', threadId: 't1' })
  vi.mocked(createAgent).mockImplementation((threadId: string) => {
    agent.threadId = threadId
    return agent
  })
  vi.mocked(cancelRun).mockResolvedValue(undefined)
  vi.mocked(listThreads).mockResolvedValue([])
  vi.mocked(getThreadHistory).mockResolvedValue({
    running: false,
    messages: [
      { id: 'u1', role: 'user', content: 'Сколько стоит MBA?', attachments: [], source: 'run' },
      { id: 'a1', role: 'assistant', content: 'От 420 000 ₽', attachments: [], source: 'run' }
    ]
  })
  useChatStore.setState({ activeThreadId: 't1' })
})

describe('ChatThread', () => {
  it('asks to choose a chat when none is active', () => {
    useChatStore.setState({ activeThreadId: null })
    mount()
    expect(screen.getByText('Выберите чат')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Вопрос агенту')).toBeNull()
    expect(getThreadHistory).not.toHaveBeenCalled()
  })

  it('shows a hint for a new chat with an empty history', async () => {
    vi.mocked(getThreadHistory).mockResolvedValue({ running: false, messages: [] })
    mount()
    expect(await screen.findByText('Задайте вопрос по таблицам')).toBeTruthy()
  })

  it('shows the history in chronological order', async () => {
    mount()
    const question = await screen.findByText('Сколько стоит MBA?')
    const answer = await screen.findByText('От 420 000 ₽')
    expect(question.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the answer growing and the indicator, then removes the indicator', async () => {
    const user = mount()
    await ask(user, 'А для компаний?')
    expect(screen.getByText('Агент отвечает…')).toBeTruthy()
    emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
    emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'x', role: 'assistant' })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: 'Есть ' })
    expect(await screen.findByText('Есть')).toBeTruthy()
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: 'скидка' })
    expect(await screen.findByText('Есть скидка')).toBeTruthy()
    emit({ type: EventType.TEXT_MESSAGE_END, messageId: 'x' })
    emit({ type: EventType.RUN_FINISHED, threadId: 't1', runId: 'r' })
    await waitFor(() => {
      expect(screen.queryByText('Агент отвечает…')).toBeNull()
    })
    expect(input().disabled).toBe(false)
  })

  it('keeps a draft typed during the run after the run finishes', async () => {
    const user = mount()
    await ask(user, 'вопрос')
    await user.type(input(), 'следующий')
    emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
    emit({ type: EventType.RUN_FINISHED, threadId: 't1', runId: 'r' })
    await waitFor(() => {
      expect(screen.queryByText('Агент отвечает…')).toBeNull()
    })
    expect(input().value).toBe('следующий')
  })

  it('refreshes the chat list after a run ends (auto title, activity time)', async () => {
    const user = mount()
    await ask(user, 'вопрос')
    await waitFor(() => {
      expect(listThreads).toHaveBeenCalledTimes(1)
    })
    emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
    emit({ type: EventType.RUN_FINISHED, threadId: 't1', runId: 'r' })
    await waitFor(() => {
      expect(listThreads).toHaveBeenCalledTimes(2)
    })
  })

  it('stops the run: calls cancelRun, keeps the text and shows the note', async () => {
    const user = mount()
    await ask(user, 'вопрос')
    emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
    emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'x', role: 'assistant' })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: 'частичный ответ' })
    await screen.findByText('частичный ответ')
    await user.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(cancelRun).toHaveBeenCalledWith('t1')
    expect(await screen.findByText('Ответ остановлен')).toBeTruthy()
    expect(screen.getByText('частичный ответ')).toBeTruthy()
    expect(input().disabled).toBe(false)
  })

  it('shows a network error with "Повторить" and returns the question to the field', async () => {
    const user = mount()
    await ask(user, 'мой вопрос')
    act(() => {
      agent.stream.error(new TypeError('Failed to fetch'))
    })
    expect(await screen.findByText(/Не удалось связаться с сервером/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
    await waitFor(() => {
      expect(input().value).toBe('мой вопрос')
    })
  })

  it('shows the unreachable-server message when the cc-api proxy answers 502', async () => {
    const user = mount()
    await ask(user, 'мой вопрос')
    act(() => {
      agent.stream.error(
        new Error('HTTP 502: {"message":"Backend is unreachable (http://localhost:3000): net::ERR_CONNECTION_REFUSED"}')
      )
    })
    expect(await screen.findByText(/Не удалось связаться с сервером/)).toBeTruthy()
    expect(screen.queryByText(/ERR_CONNECTION_REFUSED/)).toBeNull()
  })

  it('shows "Агент ещё отвечает" on 409 and does not lose the draft', async () => {
    const user = mount()
    await ask(user, 'мой вопрос')
    act(() => {
      agent.stream.error(new Error('HTTP 409: {"message":"conflict"}'))
    })
    expect(await screen.findByText('Агент ещё отвечает')).toBeTruthy()
    await waitFor(() => {
      expect(input().value).toBe('мой вопрос')
    })
  })

  it('does not send an empty message', async () => {
    const user = mount()
    await screen.findByPlaceholderText('Вопрос агенту')
    await user.type(input(), '  {Enter}')
    expect(agent.inputs).toHaveLength(0)
  })

  it('blocks sending and offers to stop when the server still runs the agent', async () => {
    vi.mocked(getThreadHistory).mockResolvedValue({ running: true, messages: [] })
    const user = mount()
    expect(await screen.findByText('Агент ещё отвечает')).toBeTruthy()
    expect(input().disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(cancelRun).toHaveBeenCalledWith('t1')
  })

  describe('attachments', () => {
    const stored = (id: string, name: string): StoredFile => ({
      id,
      name,
      mediaType: 'audio/mp4',
      kind: 'recording',
      sizeBytes: 2048,
      status: 'active',
      awaitingProcessing: true,
      uploadedAt: '2026-11-12T10:00:00.000Z',
      expiresAt: null,
      deletedAt: null
    })
    const recording = new File([new Uint8Array(2048)], 'встреча.m4a', { type: 'audio/mp4' })
    const dataTransfer = { types: ['Files'], files: [recording] }

    beforeEach(() => {
      vi.mocked(filesApi.uploadFile).mockResolvedValue(stored('f1', 'встреча.m4a'))
    })

    async function dropRecording() {
      const panel = await screen.findByRole('region', { name: 'Чат' })
      fireEvent.dragEnter(panel, { dataTransfer })
      fireEvent.dragOver(panel, { dataTransfer })
      expect(screen.getByText('Отпустите файлы, чтобы прикрепить')).toBeTruthy()
      fireEvent.drop(panel, { dataTransfer })
      expect(screen.queryByText('Отпустите файлы, чтобы прикрепить')).toBeNull()
      await waitFor(() => {
        expect((screen.getByRole('button', { name: 'Отправить' }) as HTMLButtonElement).disabled).toBe(false)
      })
    }

    it('attaches a file dropped on the chat panel and sends its id in forwardedProps', async () => {
      const user = mount()
      await dropRecording()
      expect(screen.getByText('встреча.m4a')).toBeTruthy()
      expect(filesApi.uploadFile).toHaveBeenCalledWith(recording, expect.anything())
      await user.click(screen.getByRole('button', { name: 'Отправить' }))
      await waitFor(() => {
        expect(agent.inputs).toHaveLength(1)
      })
      expect(agent.inputs[0]?.forwardedProps).toMatchObject({ fileIds: ['f1'] })
    })

    it('does not send fileIds with a message without files', async () => {
      const user = mount()
      await ask(user, 'просто вопрос')
      expect(agent.inputs[0]?.forwardedProps?.fileIds).toBeUndefined()
    })

    it('puts the expired file back as a failed card when the run is refused with 410', async () => {
      const user = mount()
      await dropRecording()
      await user.type(input(), 'расшифруй{Enter}')
      await waitFor(() => {
        expect(agent.inputs).toHaveLength(1)
      })
      act(() => {
        agent.stream.error(
          new Error('HTTP 410: {"statusCode":410,"code":"FILE_GONE","message":"File f1 is deleted"}')
        )
      })
      expect(await screen.findByText('Срок хранения файла истёк. Загрузите его заново')).toBeTruthy()
      const card = screen.getByText('встреча.m4a').closest('li')
      expect(card?.textContent).toContain('Срок хранения файла истёк')
      expect(screen.queryByRole('button', { name: 'Повторить: встреча.m4a' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Убрать: встреча.m4a' })).toBeTruthy()
    })
  })
})

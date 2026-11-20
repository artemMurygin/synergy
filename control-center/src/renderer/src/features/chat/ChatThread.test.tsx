import './test-env'
import { EventType } from '@ag-ui/client'
import type { BaseEvent } from '@ag-ui/client'
import { ToastProvider } from '@synergy/ui-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgent } from '@/lib/backend/agent'
import * as filesApi from '@/lib/backend/files.api'
import type { StoredFile } from '@/lib/backend/files.schema'
import { cancelRun, createThread, getThreadHistory, listThreads } from '@/lib/backend/threads.api'
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
      <ToastProvider>
        <ChatThread />
      </ToastProvider>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

function input(): HTMLTextAreaElement {
  const field = screen.getByPlaceholderText('Сообщение агенту')
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('the composer field is not a textarea')
  return field
}

function emit(event: BaseEvent & Record<string, unknown>) {
  act(() => {
    agent.stream.next(event)
    // the real stream completes after the run ends
    if (event.type === EventType.RUN_FINISHED) agent.stream.complete()
  })
}

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await screen.findByPlaceholderText('Сообщение агенту')
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

function sendWith(...events: (BaseEvent & Record<string, unknown>)[]) {
  for (const event of events) emit(event)
}

const PROGRAMS = ['1. MBA', '2. Маркетинг', '3. HR'].join('\n')

describe('ChatThread', () => {
  it('shows the start window with the form when no chat is active (no "Выберите чат")', async () => {
    useChatStore.setState({ activeThreadId: null })
    mount()
    expect(await screen.findByText('Чем помочь?')).toBeTruthy()
    expect(screen.queryByText('Выберите чат')).toBeNull()
    expect(screen.getByPlaceholderText('Сообщение агенту')).toBeTruthy()
    expect(getThreadHistory).not.toHaveBeenCalled()
  })

  it('the first message without a chat creates the chat and is sent in it', async () => {
    useChatStore.setState({ activeThreadId: null, pendingFirstMessage: null })
    vi.mocked(createThread).mockResolvedValue({
      id: 't9',
      title: 'Новый чат',
      titleIsCustom: false,
      createdAt: '2026-11-12T10:00:00.000Z',
      lastActivityAt: '2026-11-12T10:00:00.000Z',
      running: false
    })
    vi.mocked(getThreadHistory).mockResolvedValue({ running: false, messages: [] })
    const user = mount()
    await user.type(await screen.findByPlaceholderText('Сообщение агенту'), 'Цены на MBA{Enter}')
    await waitFor(() => {
      expect(createThread).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(1)
    })
    expect(useChatStore.getState().activeThreadId).toBe('t9')
    expect(agent.threadId).toBe('t9')
    expect(screen.getAllByText('Цены на MBA')).toHaveLength(1)
  })

  it('a card of the start window puts its text into the empty field without sending', async () => {
    useChatStore.setState({ activeThreadId: null })
    const user = mount()
    await user.click(await screen.findByText('Цены на программу'))
    expect(input().value).toContain('Цены на программу')
    expect(createThread).not.toHaveBeenCalled()
  })

  it('shows the "Сервер недоступен" banner after a network error and returns online when the probe passes', async () => {
    const user = mount()
    await ask(user, 'вопрос')
    act(() => {
      agent.stream.error(new TypeError('Failed to fetch'))
    })
    expect(await screen.findByText('Сервер недоступен')).toBeTruthy()
    const field = screen.getByPlaceholderText('Нет связи с сервером')
    expect(field).toHaveProperty('disabled', true)
  })

  it('shows a hint for a new chat with an empty history', async () => {
    vi.mocked(getThreadHistory).mockResolvedValue({ running: false, messages: [] })
    mount()
    expect(await screen.findByText('Чем помочь?')).toBeTruthy()
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
    expect((await screen.findAllByText(/Не удалось связаться с сервером/)).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Повторить' }).length).toBeGreaterThan(0)
    await waitFor(() => {
      expect((screen.getByPlaceholderText('Нет связи с сервером') as HTMLTextAreaElement).value).toBe('мой вопрос')
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
    expect((await screen.findAllByText(/Не удалось связаться с сервером/)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/ERR_CONNECTION_REFUSED/)).toBeNull()
  })

  it('shows "Агент ещё отвечает" on 409 and does not lose the draft', async () => {
    const user = mount()
    await ask(user, 'мой вопрос')
    act(() => {
      agent.stream.error(new Error('HTTP 409: {"message":"conflict"}'))
    })
    expect(await screen.findByText(/Агент ещё отвечает/)).toBeTruthy()
    await waitFor(() => {
      expect(input().value).toBe('мой вопрос')
    })
  })

  it('does not send an empty message', async () => {
    const user = mount()
    await screen.findByPlaceholderText('Сообщение агенту')
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

  it('groups the tool calls of the answer into one collapsed group with the overall state', async () => {
    const user = mount()
    await ask(user, 'найди программы')
    sendWith(
      { type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' },
      { type: EventType.TOOL_CALL_START, toolCallId: 'c1', toolCallName: 'search_programs' },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: 'c1', delta: '{"query":"mba"}' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'c1' }
    )
    expect(await screen.findByText('Вызываю инструменты…')).toBeTruthy()
    expect(screen.getByText('Выполняется · 0 из 1')).toBeTruthy()
    sendWith({ type: EventType.TOOL_CALL_RESULT, messageId: 'tr1', toolCallId: 'c1', content: '["mba"]', role: 'tool' })
    expect(await screen.findByText('1 готово')).toBeTruthy()
    expect(screen.getByText('1 вызов инструментов')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /1 вызов инструментов/ }))
    expect(await screen.findByText('search_programs')).toBeTruthy()
  })

  it('shows the hints of the next step above the form for a list of programs and sends the chosen one', async () => {
    vi.mocked(getThreadHistory).mockResolvedValue({
      running: false,
      messages: [
        { id: 'u1', role: 'user', content: 'Какие есть программы?', attachments: [], source: 'run' },
        { id: 'a1', role: 'assistant', content: `Подходят:\n${PROGRAMS}`, attachments: [], source: 'run' }
      ]
    })
    const user = mount()
    const hint = await screen.findByRole('button', { name: 'Вступительные' })
    const form = input().closest('form')
    expect(form).not.toBeNull()
    expect(hint.compareDocumentPosition(form ?? hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(hint)
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(1)
    })
    expect(JSON.stringify(agent.inputs[0]?.messages.at(-1))).toContain('вступительные испытания')
    expect(screen.queryByRole('button', { name: 'Вступительные' })).toBeNull()
  })

  it('shows no hints for an answer of another kind or while the agent answers', async () => {
    const user = mount()
    await screen.findByText('От 420 000 ₽')
    expect(screen.queryByRole('group', { name: 'Подсказки' })).toBeNull()
    await ask(user, 'ещё вопрос')
    expect(screen.queryByRole('group', { name: 'Подсказки' })).toBeNull()
  })

  it('asks again on "Повторить" after a connection error', async () => {
    const user = mount()
    await ask(user, 'мой вопрос')
    act(() => {
      agent.stream.error(new TypeError('Failed to fetch'))
    })
    await user.click((await screen.findAllByRole('button', { name: 'Повторить' }))[0])
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(2)
    })
  })

  describe('restart from a message', () => {
    const saved = (messageId: string) => ({ type: EventType.CUSTOM, name: 'user-message-saved', value: { messageId } })
    const replaceId = (index: number) =>
      (agent.inputs[index]?.forwardedProps as { replaceFromMessageId?: string } | undefined)?.replaceFromMessageId

    it('"Повторить" after an error sends replaceFromMessageId of the saved question and adds no duplicate', async () => {
      vi.mocked(getThreadHistory).mockResolvedValue({ running: false, messages: [] })
      const user = mount()
      await ask(user, 'мой вопрос')
      emit(saved('77'))
      act(() => {
        agent.stream.error(new TypeError('Failed to fetch'))
      })
      await user.click((await screen.findAllByRole('button', { name: 'Повторить' }))[0])
      await waitFor(() => {
        expect(agent.inputs).toHaveLength(2)
      })
      expect(replaceId(0)).toBeUndefined()
      expect(replaceId(1)).toBe('77')
      expect(screen.getAllByText('мой вопрос')).toHaveLength(1)
    })

    it('"Повторить" without a known server id restarts without a point', async () => {
      vi.mocked(getThreadHistory).mockResolvedValue({ running: false, messages: [] })
      const user = mount()
      await ask(user, 'вопрос')
      act(() => {
        agent.stream.error(new TypeError('Failed to fetch'))
      })
      await user.click((await screen.findAllByRole('button', { name: 'Повторить' }))[0])
      await waitFor(() => {
        expect(agent.inputs).toHaveLength(2)
      })
      expect(replaceId(1)).toBeUndefined()
    })

    it('an edited history question restarts the chat from its server id', async () => {
      const user = mount()
      const question = await screen.findByText('Сколько стоит MBA?')
      await user.hover(question)
      await user.click(await screen.findByRole('button', { name: 'Изменить' }))
      const field = await screen.findByLabelText('Изменить сообщение')
      await user.clear(field)
      await user.type(field, 'Сколько стоит MBA онлайн?{Enter}')
      await waitFor(() => {
        expect(agent.inputs).toHaveLength(1)
      })
      expect(replaceId(0)).toBe('u1')
    })

    it('offers no edit for a question the server marked as not editable', async () => {
      vi.mocked(getThreadHistory).mockResolvedValue({
        running: false,
        messages: [{ id: 'u1', role: 'user', content: 'старый вопрос', attachments: [], source: 'run', editable: false }]
      })
      const user = mount()
      await user.hover(await screen.findByText('старый вопрос'))
      expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
    })

    it('rereads the history after a restarted run finishes', async () => {
      const user = mount()
      const question = await screen.findByText('Сколько стоит MBA?')
      await user.hover(question)
      await user.click(await screen.findByRole('button', { name: 'Изменить' }))
      const field = await screen.findByLabelText('Изменить сообщение')
      await user.type(field, '!{Enter}')
      await waitFor(() => {
        expect(agent.inputs).toHaveLength(1)
      })
      const calls = vi.mocked(getThreadHistory).mock.calls.length
      emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
      emit({ type: EventType.RUN_FINISHED, threadId: 't1', runId: 'r' })
      await waitFor(() => {
        expect(vi.mocked(getThreadHistory).mock.calls.length).toBeGreaterThan(calls)
      })
    })
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
      const form = (await screen.findByPlaceholderText('Сообщение агенту')).closest('form')
      if (form === null) throw new Error('composer form not found')
      fireEvent.dragEnter(form, { dataTransfer })
      fireEvent.dragOver(form, { dataTransfer })
      fireEvent.drop(form, { dataTransfer })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Отправить' })).toHaveProperty('disabled', false)
      })
    }

    it('attaches a file dropped on the composer and sends its id in forwardedProps', async () => {
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
      expect(agent.inputs[0]?.forwardedProps).not.toHaveProperty('fileIds')
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
      // the sent message keeps its card too; the failed one is in the composer
      const draft = screen.getByRole('list', { name: 'Прикреплённые файлы' })
      const card = within(draft).getByText('встреча.m4a').closest('li')
      expect(card?.textContent).toContain('Срок хранения файла истёк')
      expect(screen.queryByRole('button', { name: 'Повторить: встреча.m4a' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Убрать: встреча.m4a' })).toBeTruthy()
    })
  })
})

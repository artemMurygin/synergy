import './test-env'
import { EventType } from '@ag-ui/client'
import type { BaseEvent } from '@ag-ui/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgent } from '@/lib/backend/agent'
import { BackendError } from '@/lib/backend/errors'
import * as filesApi from '@/lib/backend/files.api'
import type { HistoryMessage, MessageAttachment } from '@/lib/backend/schema'
import { cancelRun, getThreadHistory, listThreads } from '@/lib/backend/threads.api'
import { saveBlob } from '@/lib/save-blob'
import { useChatStore } from '@/stores/chat.store'
import { ChatThread } from './ChatThread'
import { FakeAgent } from './fake-agent'
import { threadHistoryOptions } from './use-thread-history'

vi.mock('@/lib/backend/agent')
vi.mock('@/lib/backend/threads.api')
vi.mock('@/lib/backend/files.api')
vi.mock('@/lib/save-blob')

afterEach(cleanup)

let agent: FakeAgent
let client: QueryClient

const recording: MessageAttachment = {
  id: 'f1',
  name: 'встреча-12-ноя.m4a',
  mediaType: 'audio/mp4',
  kind: 'recording',
  sizeBytes: 84 * 1024 * 1024,
  status: 'active'
}

const transcript: MessageAttachment = {
  id: 'f2',
  name: 'Расшифровка — встреча-12-ноя.docx',
  mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  kind: 'document',
  sizeBytes: 48 * 1024,
  status: 'active'
}

const READY_TEXT = 'Расшифровка готова: 3 спикера, 01:12:40.'

function history(messages: HistoryMessage[]) {
  vi.mocked(getThreadHistory).mockResolvedValue({ running: false, messages })
}

function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ChatThread />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

function emit(event: BaseEvent & Record<string, unknown>) {
  act(() => {
    agent.stream.next(event)
    if (event.type === EventType.RUN_FINISHED) agent.stream.complete()
  })
}

function card(name: string): HTMLElement {
  const item = screen.getByText(name).closest('li')
  if (item === null) throw new Error(`no card for ${name}`)
  return item
}

beforeEach(() => {
  agent = new FakeAgent({ url: 'cc-api://backend/agent', threadId: 't1' })
  vi.mocked(createAgent).mockImplementation((threadId: string) => {
    agent.threadId = threadId
    return agent
  })
  vi.mocked(cancelRun).mockResolvedValue(undefined)
  vi.mocked(listThreads).mockResolvedValue([])
  history([])
  useChatStore.setState({ activeThreadId: 't1' })
})

describe('files and system messages in the feed', () => {
  it('shows the files of a user message above its text', async () => {
    history([
      { id: 'u1', role: 'user', content: 'Расшифруй', attachments: [recording], source: 'run' },
      { id: 'a1', role: 'assistant', content: 'Запустил расшифровку', attachments: [], source: 'run' }
    ])
    mount()
    const name = await screen.findByText('встреча-12-ноя.m4a')
    const text = screen.getByText('Расшифруй')
    expect(name.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(card('встреча-12-ноя.m4a')).getByText('84 МБ')).toBeTruthy()
  })

  it('shows a message of one file without an empty text bubble', async () => {
    history([{ id: 'u1', role: 'user', content: '', attachments: [recording], source: 'run' }])
    mount()
    await screen.findByText('встреча-12-ноя.m4a')
    expect(document.querySelector('.bg-brand-red.rounded-2xl')).toBeNull()
  })

  it('shows the files of an answer after its text', async () => {
    history([
      { id: 'u1', role: 'user', content: 'Спикер 1 — Анна', attachments: [], source: 'run' },
      { id: 'a1', role: 'assistant', content: 'Обновил имена', attachments: [transcript], source: 'run' }
    ])
    mount()
    const name = await screen.findByText('Расшифровка — встреча-12-ноя.docx')
    const text = screen.getByText('Обновил имена')
    expect(text.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds the card of a file attached during the stream before the answer ends', async () => {
    history([{ id: 'u1', role: 'user', content: 'Спикер 1 — Анна', attachments: [], source: 'run' }])
    const user = mount()
    await user.type(await screen.findByPlaceholderText('Сообщение агенту'), 'Спикер 2 — Олег{Enter}')
    await waitFor(() => {
      expect(agent.inputs.length).toBeGreaterThan(0)
    })
    emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
    emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'x', role: 'assistant' })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: 'Обновил имена' })
    emit({
      type: EventType.CUSTOM,
      name: 'file-attached',
      value: { id: 'f2', name: transcript.name, mediaType: transcript.mediaType, size: transcript.sizeBytes, kind: 'document' }
    })
    expect(await screen.findByText('Расшифровка — встреча-12-ноя.docx')).toBeTruthy()
    expect(screen.getByText('Агент отвечает…')).toBeTruthy()
    expect(within(card('Расшифровка — встреча-12-ноя.docx')).getByText('48 КБ')).toBeTruthy()
    emit({ type: EventType.TEXT_MESSAGE_END, messageId: 'x' })
    emit({ type: EventType.RUN_FINISHED, threadId: 't1', runId: 'r' })
    await waitFor(() => {
      expect(screen.queryByText('Агент отвечает…')).toBeNull()
    })
    expect(screen.getByText('Расшифровка — встреча-12-ноя.docx')).toBeTruthy()
    // the next question carries the answer with the file card as plain text history
    await user.type(screen.getByPlaceholderText('Сообщение агенту'), 'Спасибо{Enter}')
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(2)
    })
    const sent = agent.inputs[1]?.messages.find((m) => m.role === 'assistant')
    expect(sent?.content).toBe('Обновил имена')
  })

  it('downloads a file under its original name', async () => {
    const blob = new Blob(['docx'])
    vi.mocked(filesApi.downloadFile).mockResolvedValue(blob)
    history([{ id: 'a1', role: 'assistant', content: 'Готово', attachments: [transcript], source: 'run' }])
    const user = mount()
    await user.click(await screen.findByRole('button', { name: 'Скачать Расшифровка — встреча-12-ноя.docx' }))
    await waitFor(() => {
      expect(saveBlob).toHaveBeenCalledWith(blob, 'Расшифровка — встреча-12-ноя.docx')
    })
    expect(filesApi.downloadFile).toHaveBeenCalledWith('f2')
  })

  it('shows the error notice above the feed when a download fails', async () => {
    vi.mocked(filesApi.downloadFile).mockRejectedValue(new BackendError('boom'))
    history([{ id: 'a1', role: 'assistant', content: 'Готово', attachments: [transcript], source: 'run' }])
    const user = mount()
    await user.click(await screen.findByRole('button', { name: 'Скачать Расшифровка — встреча-12-ноя.docx' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не удалось скачать файл')
    expect(alert.textContent).toContain('Расшифровка — встреча-12-ноя.docx')
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('shows an expired file of a saved message as inactive', async () => {
    history([
      { id: 'a1', role: 'assistant', content: 'Готово', attachments: [{ ...transcript, status: 'deleted' }], source: 'run' }
    ])
    mount()
    await screen.findByText('Расшифровка — встреча-12-ноя.docx')
    expect(screen.getByText('Срок хранения истёк')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Скачать/ })).toBeNull()
  })

  it('labels a system message and does not label an answer', async () => {
    history([
      { id: 'u1', role: 'user', content: 'вопрос', attachments: [], source: 'run' },
      { id: 'a1', role: 'assistant', content: 'ответ', attachments: [], source: 'run' },
      { id: 's1', role: 'assistant', content: READY_TEXT, attachments: [transcript], source: 'system' }
    ])
    mount()
    await screen.findByText(READY_TEXT)
    const labels = screen.getAllByText('Сообщение о расшифровке')
    expect(labels).toHaveLength(1)
    expect(labels[0]?.compareDocumentPosition(screen.getByText(READY_TEXT)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows a system message that arrives in the open chat without reopening it', async () => {
    history([
      { id: 'u1', role: 'user', content: 'Расшифруй', attachments: [recording], source: 'run' },
      { id: 'a1', role: 'assistant', content: 'Запустил расшифровку', attachments: [], source: 'run' }
    ])
    mount()
    await screen.findByText('Запустил расшифровку')
    history([
      { id: 'u1', role: 'user', content: 'Расшифруй', attachments: [recording], source: 'run' },
      { id: 'a1', role: 'assistant', content: 'Запустил расшифровку', attachments: [], source: 'run' },
      { id: 's1', role: 'assistant', content: READY_TEXT, attachments: [transcript], source: 'system' }
    ])
    await act(async () => {
      await client.invalidateQueries({ queryKey: threadHistoryOptions('t1').queryKey })
    })
    expect(await screen.findByText(READY_TEXT)).toBeTruthy()
    expect(screen.getByText('Расшифровка — встреча-12-ноя.docx')).toBeTruthy()
    expect(screen.getAllByText('Запустил расшифровку')).toHaveLength(1)
  })
})

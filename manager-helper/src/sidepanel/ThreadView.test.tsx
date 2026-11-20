import { LayoutModeProvider } from '@synergy/ui-kit'
import type { LayoutMode, MessageFile } from '@synergy/ui-kit'
import { EventType, HttpAgent } from '@ag-ui/client'
import type { BaseEvent, RunAgentInput } from '@ag-ui/client'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Subject } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveSessionId } from '@/shared/active-session'
import { AskError } from '@/shared/api'
import { cancelRun, createAgent } from '@/shared/agent-client'
import { getThread } from '@/shared/threads-api'
import type { ThreadHistory } from '@/shared/threads-api'
import { ChatRuntimeProvider } from './ChatRuntimeProvider'
import { ThreadView } from './ThreadView'

vi.mock('@/shared/active-session')
vi.mock('@/shared/agent-client')
vi.mock('@/shared/threads-api')
vi.mock('@/shared/settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))
const upload = vi.fn()
vi.mock('./attachments/use-file-upload-port', () => ({
  useFileUploadPort: () => ({ upload }),
}))

/** Agent whose runs are driven by the test. */
class FakeAgent extends HttpAgent {
  readonly inputs: RunAgentInput[] = []
  stream = new Subject<BaseEvent>()

  override run(input: RunAgentInput): ReturnType<HttpAgent['run']> {
    this.inputs.push(input)
    this.stream = new Subject<BaseEvent>()
    return this.stream.asObservable()
  }
}

let agent: FakeAgent

const history = (...texts: string[]): ThreadHistory => ({
  running: false,
  messages: texts.map((text, i) => ({
    id: `m${String(i)}`,
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: text,
  })),
})

function emit(event: BaseEvent & Record<string, unknown>) {
  act(() => {
    agent.stream.next(event)
  })
}

const startRunEvents = () => {
  emit({ type: EventType.RUN_STARTED, threadId: 'a', runId: 'r1' })
  emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'a1', role: 'assistant' })
}

interface Setup {
  serverRunning?: boolean
  onStopServerRun?: () => void
  onSendWithoutChat?: (text: string, files: MessageFile[]) => Promise<boolean>
  onQuickSearch?: (query: string, title: string) => void
  layout?: LayoutMode
  activeId?: string | null
}

async function mount(setup: Setup = {}) {
  const onStopServerRun = setup.onStopServerRun ?? vi.fn()
  const activeId = setup.activeId === undefined ? 'a' : setup.activeId
  render(
    <LayoutModeProvider mode={setup.layout ?? 'tablet'}>
      <ChatRuntimeProvider activeId={activeId} onSelect={vi.fn()} onCreate={vi.fn()}>
        <ThreadView
          serverRunning={setup.serverRunning ?? false}
          onStopServerRun={onStopServerRun}
          onQuickSearch={setup.onQuickSearch ?? vi.fn()}
          onSendWithoutChat={setup.onSendWithoutChat}
        />
      </ChatRuntimeProvider>
    </LayoutModeProvider>,
  )
  if (activeId !== null) {
    await waitFor(() => {
      expect(screen.getByText('вопрос')).toBeTruthy()
    })
  }
  return { onStopServerRun }
}

const input = () => screen.getByPlaceholderText(/Сообщение агенту/)

function fieldValue(): string {
  const field = input()
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('The composer is not a textarea')
  return field.value
}

async function ask(text: string) {
  fireEvent.change(input(), { target: { value: text } })
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(false)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  await waitFor(() => {
    expect(agent.inputs.length).toBeGreaterThan(0)
  })
}

beforeEach(() => {
  agent = new FakeAgent({ url: 'http://api.test/agent', threadId: 'a' })
  vi.mocked(createAgent).mockImplementation((threadId: string) => {
    agent.threadId = threadId
    return Promise.resolve(agent)
  })
  vi.mocked(cancelRun).mockResolvedValue(undefined)
  vi.mocked(setActiveSessionId).mockResolvedValue(undefined)
  vi.mocked(getThread).mockResolvedValue(history('вопрос', 'ответ **жирный**'))
})

describe('ThreadView', () => {
  it('shows the history in order and renders markdown of the agent answer', async () => {
    await mount()
    expect(screen.getByText('вопрос')).toBeTruthy()
    expect(screen.getByText('жирный').tagName).toBe('STRONG')
  })

  it('keeps the send button disabled while the composer is empty', async () => {
    await mount()
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)
  })

  it('sends the typed question and clears the field', async () => {
    await mount()
    await ask('новый вопрос')
    expect(agent.inputs[0]?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: 'новый вопрос',
    })
    expect(fieldValue()).toBe('')
  })

  it('shows the stop button instead of send and the pending dot while the run is going', async () => {
    await mount()
    await ask('q')
    startRunEvents()
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: 'Часть ответа' })
    await waitFor(() => {
      expect(screen.getByText('Часть ответа')).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Отправить' })).toBeNull()
    expect(screen.getByText('Агент отвечает…')).toBeTruthy()
  })

  it('stop cancels the run on the server and keeps the received text with a note', async () => {
    await mount()
    await ask('q')
    startRunEvents()
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: 'Часть ответа' })
    await waitFor(() => {
      expect(screen.getByText('Часть ответа')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Остановить' }))
    await waitFor(() => {
      expect(cancelRun).toHaveBeenCalledWith('a')
    })
    await waitFor(() => {
      expect(screen.getByText('Ответ остановлен')).toBeTruthy()
    })
    expect(screen.getByText('Часть ответа')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
  })

  it('shows the tool calls of the answer as a group that expands into rows', async () => {
    await mount()
    await ask('q')
    startRunEvents()
    emit({ type: EventType.TOOL_CALL_START, toolCallId: 't1', toolCallName: 'search_books' })
    emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: 't1', delta: '{"q":"МВА"}' })
    emit({ type: EventType.TOOL_CALL_END, toolCallId: 't1' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /инструмент/ })).toBeTruthy()
    })
    const group = screen.getByRole('button', { name: /инструмент/ })
    if (group.getAttribute('aria-expanded') !== 'true') fireEvent.click(group)
    expect(screen.getByText('search_books')).toBeTruthy()
  })

  it('shows the error with a retry action, keeps the question in the field and retries', async () => {
    await mount()
    await ask('мой вопрос')
    emit({ type: EventType.RUN_STARTED, threadId: 'a', runId: 'r1' })
    emit({ type: EventType.RUN_ERROR, message: 'Агент упал' })
    act(() => {
      agent.stream.complete()
    })
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Агент упал')
    })
    expect(fieldValue()).toBe('мой вопрос')
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(2)
    })
    expect(agent.inputs[1]?.messages.at(-1)).toMatchObject({ role: 'user', content: 'мой вопрос' })
    await waitFor(() => {
      expect(fieldValue()).toBe('')
    })
  })

  it('on an unreachable server shows the banner, locks the field, keeps the question and probes /health', async () => {
    await mount()
    await ask('мой вопрос')
    act(() => {
      // createAgent turns the network failure into this text (agent-client.test.ts).
      agent.stream.error(
        new AskError('Не удалось связаться с сервером. Проверьте адрес бэкенда в настройках расширения.'),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Сервер недоступен')).toBeTruthy()
    })
    expect(screen.getAllByText(/настройках расширения/).length).toBeGreaterThan(0)
    const locked = screen.getByPlaceholderText('Нет связи с сервером')
    expect(locked.hasAttribute('disabled')).toBe(true)
    expect(locked instanceof HTMLTextAreaElement && locked.value).toBe('мой вопрос')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }))
    const banner = screen.getByText('Сервер недоступен').closest('[role="alert"]')
    if (!(banner instanceof HTMLElement)) throw new Error('no banner')
    fireEvent.click(within(banner).getByRole('button', { name: 'Повторить' }))
    await waitFor(() => {
      expect(screen.queryByText('Сервер недоступен')).toBeNull()
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/health')
    expect(fieldValue()).toBe('мой вопрос')
    fetchMock.mockRestore()
  })

  it('keeps the banner when the probe fails', async () => {
    await mount()
    await ask('q')
    act(() => {
      agent.stream.error(new TypeError('Failed to fetch'))
    })
    await waitFor(() => {
      expect(screen.getByText('Сервер недоступен')).toBeTruthy()
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const banner = screen.getByText('Сервер недоступен').closest('[role="alert"]')
    if (!(banner instanceof HTMLElement)) throw new Error('no banner')
    fireEvent.click(within(banner).getByRole('button', { name: 'Повторить' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(screen.getByText('Сервер недоступен')).toBeTruthy()
    fetchMock.mockRestore()
  })

  it('retries from the saved question without a second copy of it', async () => {
    vi.mocked(getThread).mockResolvedValueOnce(history('вопрос', 'ответ'))
    await mount()
    await ask('мой вопрос')
    emit({ type: EventType.CUSTOM, name: 'user-message-saved', value: { messageId: 'm7' } })
    emit({ type: EventType.RUN_STARTED, threadId: 'a', runId: 'r1' })
    emit({ type: EventType.RUN_ERROR, message: 'Агент упал' })
    act(() => {
      agent.stream.complete()
    })
    await waitFor(() => {
      expect(screen.getByText(/Агент упал/)).toBeTruthy()
    })
    expect(agent.inputs[0]?.forwardedProps ?? {}).not.toHaveProperty('replaceFromMessageId')

    vi.mocked(getThread).mockResolvedValue({
      running: false,
      messages: [
        { id: 'm0', role: 'user', content: 'вопрос' },
        { id: 'm1', role: 'assistant', content: 'ответ' },
        { id: 'm7', role: 'user', content: 'мой вопрос', editable: true },
        { id: 'm8', role: 'assistant', content: 'готово' },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(2)
    })
    expect(agent.inputs[1]?.forwardedProps).toMatchObject({ replaceFromMessageId: 'm7' })
    emit({ type: EventType.CUSTOM, name: 'user-message-saved', value: { messageId: 'm9' } })
    emit({ type: EventType.RUN_STARTED, threadId: 'a', runId: 'r2' })
    emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'a2', role: 'assistant' })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a2', delta: 'готово' })
    emit({ type: EventType.TEXT_MESSAGE_END, messageId: 'a2' })
    emit({ type: EventType.RUN_FINISHED, threadId: 'a', runId: 'r2' })
    act(() => {
      agent.stream.complete()
    })
    await waitFor(() => {
      expect(getThread).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.getAllByText('мой вопрос')).toHaveLength(1)
    })
    expect(screen.getAllByText('готово')).toHaveLength(1)
  })

  it('edits a sent question: the run carries replaceFromMessageId of the edited message', async () => {
    vi.mocked(getThread).mockResolvedValue({
      running: false,
      messages: [
        { id: 'm0', role: 'user', content: 'вопрос', editable: true },
        { id: 'm1', role: 'assistant', content: 'ответ' },
      ],
    })
    await mount()
    fireEvent.click(screen.getByRole('button', { name: /Изменить/ }))
    const field = screen.getByLabelText('Изменить сообщение')
    fireEvent.change(field, { target: { value: 'вопрос по-другому' } })
    const form = field.closest('form')
    if (form === null) throw new Error('no edit form')
    fireEvent.click(within(form).getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(1)
    })
    expect(agent.inputs[0]?.forwardedProps).toMatchObject({ replaceFromMessageId: 'm0' })
  })

  it('does not offer to edit a question the server cannot restart from', async () => {
    vi.mocked(getThread).mockResolvedValue({
      running: false,
      messages: [
        { id: 'm0', role: 'user', content: 'вопрос', editable: false },
        { id: 'm1', role: 'assistant', content: 'ответ' },
      ],
    })
    await mount()
    expect(screen.queryByRole('button', { name: /Изменить/ })).toBeNull()
  })

  it('shows the welcome window with suggestion cards in an empty chat', async () => {
    vi.mocked(getThread).mockResolvedValue({ running: false, messages: [] })
    await mount({ activeId: 'a' }).catch(() => undefined)
    await waitFor(() => {
      expect(screen.getByText('Чем помочь?')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Цены на программу'))
    expect(fieldValue()).toContain('Цены на программу')
  })

  it('has no quick search form in the feed and no label: only the "Подбор" pill in the composer', async () => {
    await mount()
    expect(screen.queryByText('Быстрый подбор')).toBeNull()
    expect(screen.getByRole('button', { name: 'Подбор' })).toBeTruthy()
  })

  it('opens the sheet from "Подбор", sends the query and the title and closes it', async () => {
    const onQuickSearch = vi.fn()
    await mount({ onQuickSearch })
    fireEvent.click(screen.getByRole('button', { name: 'Подбор' }))
    expect(screen.getByRole('dialog', { name: 'Быстрый подбор' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Отправить в чат' }))
    expect(onQuickSearch).toHaveBeenCalledWith(expect.stringContaining('Подбери'), 'Подбор программ')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the form values when the sheet is closed and opened again', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Подбор' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Уровень' }), { target: { value: 'master' } })
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    fireEvent.click(screen.getByRole('button', { name: 'Подбор' }))
    const level = screen.getByRole('combobox', { name: 'Уровень' })
    expect(level instanceof HTMLSelectElement && level.value).toBe('master')
  })

  it('blocks the sending from the sheet while the agent answers', async () => {
    const onQuickSearch = vi.fn()
    await mount({ serverRunning: true, onQuickSearch })
    fireEvent.click(screen.getByRole('button', { name: 'Подбор' }))
    expect(screen.getByRole('button', { name: 'Отправить в чат' }).hasAttribute('disabled')).toBe(true)
    expect(onQuickSearch).not.toHaveBeenCalled()
  })

  it('attaches a file, shows its tile and sends the file id with the run', async () => {
    upload.mockResolvedValue({ fileId: 'f-1' })
    await mount()
    const picker = screen.getByLabelText('Выбрать файлы')
    const file = new File(['abc'], 'Прайс.pdf', { type: 'application/pdf' })
    fireEvent.change(picker, { target: { files: [file] } })
    await waitFor(() => {
      expect(screen.getByText('Прайс.pdf')).toBeTruthy()
    })
    // A file alone is enough to send: the text is optional.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(false)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(agent.inputs.length).toBeGreaterThan(0)
    })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(agent.inputs[0]?.forwardedProps)).toContain('f-1')
  })

  it('without a chat passes the attached file to the new chat and clears the tile', async () => {
    upload.mockResolvedValue({ fileId: 'f-1' })
    const onSendWithoutChat = vi.fn(() => Promise.resolve(true))
    await mount({ onSendWithoutChat })
    fireEvent.change(screen.getByLabelText('Выбрать файлы'), {
      target: { files: [new File(['abc'], 'Прайс.pdf', { type: 'application/pdf' })] },
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(false)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(onSendWithoutChat).toHaveBeenCalledTimes(1)
    })
    expect(onSendWithoutChat).toHaveBeenCalledWith(
      '',
      [expect.objectContaining({ id: 'f-1', name: 'Прайс.pdf' })],
    )
    await waitFor(() => {
      expect(screen.queryByText('Прайс.pdf')).toBeNull()
    })
  })

  it('returning to a running chat shows the indicator, blocks sending and offers stop', async () => {
    const { onStopServerRun } = await mount({ serverRunning: true })
    expect(screen.getByText('Агент ещё отвечает')).toBeTruthy()
    expect(input().hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Отправить' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(onStopServerRun).toHaveBeenCalledTimes(1)
  })

  it('has no indicator and an enabled field when the chat is idle', async () => {
    await mount()
    expect(screen.queryByText('Агент ещё отвечает')).toBeNull()
    expect(input().hasAttribute('disabled')).toBe(false)
  })
})

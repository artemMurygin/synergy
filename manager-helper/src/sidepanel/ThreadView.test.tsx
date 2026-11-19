import { EventType, HttpAgent } from '@ag-ui/client'
import type { BaseEvent, RunAgentInput } from '@ag-ui/client'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
}

async function mount(setup: Setup = {}) {
  const onStopServerRun = setup.onStopServerRun ?? vi.fn()
  render(
    <ChatRuntimeProvider activeId="a" onSelect={vi.fn()} onCreate={vi.fn()}>
      <ThreadView
        serverRunning={setup.serverRunning ?? false}
        onStopServerRun={onStopServerRun}
        onQuickSearch={vi.fn()}
      />
    </ChatRuntimeProvider>,
  )
  await waitFor(() => {
    expect(screen.getByText('вопрос')).toBeTruthy()
  })
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
    expect(screen.getByRole('button', { name: 'Повторить вопрос' })).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: /инструмент/ }))
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

  it('on an unreachable server hints at the settings and keeps the question', async () => {
    await mount()
    await ask('мой вопрос')
    act(() => {
      // createAgent turns the network failure into this text (agent-client.test.ts).
      agent.stream.error(
        new AskError('Не удалось связаться с сервером. Проверьте адрес бэкенда в настройках расширения.'),
      )
    })
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Проверьте адрес бэкенда')
    })
    expect(fieldValue()).toBe('мой вопрос')
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

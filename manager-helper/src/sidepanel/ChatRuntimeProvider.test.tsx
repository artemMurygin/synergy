import { EventType, HttpAgent } from '@ag-ui/client'
import type { BaseEvent, RunAgentInput } from '@ag-ui/client'
import { useAui, useAuiState } from '@assistant-ui/react'
import type { AssistantClient } from '@assistant-ui/react'
import type { MessageFile } from '@synergy/ui-kit'
import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { Subject } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveSessionId } from '@/shared/active-session'
import { cancelRun, createAgent } from '@/shared/agent-client'
import { createThread, getThread } from '@/shared/threads-api'
import type { Thread, ThreadHistory } from '@/shared/threads-api'
import { ChatRuntimeProvider, useChatHistory } from './ChatRuntimeProvider'

vi.mock('@/shared/active-session')
vi.mock('@/shared/agent-client')
vi.mock('@/shared/threads-api')

/** Agent whose runs are driven by the test: it records inputs and emits what the test pushes. */
class FakeAgent extends HttpAgent {
  readonly inputs: RunAgentInput[] = []
  readonly stream = new Subject<BaseEvent>()

  override run(input: RunAgentInput): ReturnType<HttpAgent['run']> {
    this.inputs.push(input)
    return this.stream.asObservable()
  }
}

let agent: FakeAgent
const handle: { aui: AssistantClient | null; history: ReturnType<typeof useChatHistory> | null } = {
  aui: null,
  history: null,
}

function chat(): ReturnType<typeof useChatHistory> {
  if (handle.history === null) throw new Error('Probe is not mounted')
  return handle.history
}

function aui(): AssistantClient {
  if (handle.aui === null) throw new Error('Probe is not mounted')
  return handle.aui
}

function Probe() {
  const client = useAui()
  const chatHistory = useChatHistory()
  useEffect(() => {
    handle.aui = client
    handle.history = chatHistory
  })
  const messages = useAuiState((s) => s.thread.messages)
  const texts = messages.map((m) =>
    m.content.map((p) => (p.type === 'text' ? p.text : `[${p.type}]`)).join(''),
  )
  const running = useAuiState((s) => s.thread.isRunning)
  return (
    <div>
      <output data-testid="messages">{JSON.stringify(texts)}</output>
      <output data-testid="custom">
        {JSON.stringify(messages.map((m) => m.metadata.custom))}
      </output>
      <output data-testid="artifacts">
        {JSON.stringify(
          messages.flatMap((m) =>
            m.content.flatMap((p) => (p.type === 'tool-call' ? [p.artifact ?? null] : [])),
          ),
        )}
      </output>
      <output data-testid="running">{String(running)}</output>
    </div>
  )
}

function history(...texts: string[]): ThreadHistory {
  return {
    running: false,
    messages: texts.map((text, i) => ({
      id: `${text}-${String(i)}`,
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: text,
    })),
  }
}

function thread(id: string): Thread {
  return {
    id,
    title: id,
    titleIsCustom: false,
    createdAt: '2026-01-01T00:00:00Z',
    lastActivityAt: '2026-01-01T00:00:00Z',
    running: false,
  }
}

interface Setup {
  activeId?: string | null
  onSelect?: (id: string) => void
  onCreate?: () => Promise<Thread>
}

function Harness({ activeId, onSelect, onCreate }: Required<Setup>) {
  return (
    <ChatRuntimeProvider activeId={activeId} onSelect={onSelect} onCreate={onCreate}>
      <Probe />
    </ChatRuntimeProvider>
  )
}

function mount(setup: Setup = {}) {
  const props: Required<Setup> = {
    activeId: 'a',
    onSelect: vi.fn(),
    onCreate: vi.fn(() => Promise.resolve(thread('new'))),
    ...setup,
  }
  const view = render(<Harness {...props} />)
  return {
    props,
    rerenderWith: (next: Partial<Setup>) => {
      view.rerender(<Harness {...props} {...next} />)
    },
    messages: (): unknown => JSON.parse(view.getByTestId('messages').textContent),
    custom: (): unknown => JSON.parse(view.getByTestId('custom').textContent),
    artifacts: (): unknown => JSON.parse(view.getByTestId('artifacts').textContent),
  }
}

async function startRun(text: string) {
  await act(async () => {
    aui().thread.append(text)
    await Promise.resolve()
  })
  await waitFor(() => {
    expect(agent.inputs.length).toBeGreaterThan(0)
  })
}

function emit(event: BaseEvent & Record<string, unknown>) {
  act(() => {
    agent.stream.next(event)
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
  vi.mocked(getThread).mockImplementation((id: string) =>
    Promise.resolve(id === 'a' ? history('вопрос A', 'ответ A') : history('вопрос B', 'ответ B')),
  )
  vi.mocked(createThread).mockResolvedValue(thread('new'))
})

describe('ChatRuntimeProvider restart', () => {
  it('sends replaceFromMessageId once for a restart point the server knows', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    act(() => {
      chat().restartFrom('вопрос A-0')
    })
    await startRun('правка')
    expect(agent.inputs[0]?.forwardedProps).toMatchObject({ replaceFromMessageId: 'вопрос A-0' })
    emit({ type: EventType.RUN_FINISHED, threadId: 'a', runId: 'r' })
    await startRun('ещё')
    expect(agent.inputs[1]?.forwardedProps ?? {}).not.toHaveProperty('replaceFromMessageId')
  })

  it('sends no restart point for a message the server has not confirmed', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    act(() => {
      chat().restartFrom('unknown')
    })
    await startRun('повтор')
    expect(agent.inputs[0]?.forwardedProps ?? {}).not.toHaveProperty('replaceFromMessageId')
  })

  it('learns the server id of a new question from user-message-saved and hides the event from the runtime', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    await startRun('новый')
    const localId = agent.inputs[0]?.messages.at(-1)?.id ?? ''
    expect(chat().isEditable(localId)).toBe(false)
    emit({ type: EventType.CUSTOM, name: 'user-message-saved', value: { messageId: '42' } })
    emit({ type: EventType.RUN_STARTED, threadId: 'a', runId: 'r' })
    await waitFor(() => {
      expect(chat().isEditable(localId)).toBe(true)
    })
  })

  it('treats a history question marked editable:false as not editable', async () => {
    vi.mocked(getThread).mockResolvedValue({
      running: false,
      messages: [
        { id: 'q1', role: 'user', content: 'старый', editable: false },
        { id: 'q2', role: 'user', content: 'свежий', editable: true },
      ],
    })
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['старый', 'свежий'])
    })
    expect(chat().isEditable('q1')).toBe(false)
    expect(chat().isEditable('q2')).toBe(true)
  })
})

describe('ChatRuntimeProvider', () => {
  it('carries the attachments and source of the history into metadata.custom', async () => {
    const file: MessageFile = {
      id: 'f-1',
      name: 'Расшифровка.docx',
      mediaType: 'application/pdf',
      kind: 'document',
      sizeBytes: 10,
      status: 'active',
    }
    const loaded: ThreadHistory = {
      running: false,
      messages: [
        { id: 'm1', role: 'user', content: 'вопрос', attachments: [file] },
        { id: 'm2', role: 'assistant', content: 'готово', source: 'system' },
      ],
    }
    vi.mocked(getThread).mockResolvedValue(loaded)
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос', 'готово'])
    })
    expect(view.custom()).toEqual([
      { attachments: [file], source: 'run' },
      { attachments: [], source: 'system' },
    ])
  })

  it('carries the durationMs of a history tool call into the artifact of the tool-call part', async () => {
    // The server adds durationMs to a stored call: a field the AG-UI type does not know
    const timed = { id: 'c1', type: 'function' as const, function: { name: 'find', arguments: '{}' }, durationMs: 400 }
    vi.mocked(getThread).mockResolvedValue({
      running: false,
      messages: [
        { id: 'm1', role: 'user', content: 'вопрос' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'готово',
          toolCalls: [timed, { id: 'c2', type: 'function', function: { name: 'old', arguments: '{}' } }],
        },
        { id: 'c1-result', role: 'tool', toolCallId: 'c1', content: '' },
        { id: 'c2-result', role: 'tool', toolCallId: 'c2', content: '' },
      ],
    })
    const view = mount()
    await waitFor(() => {
      expect(view.artifacts()).toEqual([{ durationMs: 400 }, null])
    })
  })

  it('onSwitchToThread loads the history of the active chat as AG-UI messages', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    expect(getThread).toHaveBeenCalledWith('a')
    expect(createAgent).toHaveBeenCalledWith('a')
  })

  it('shows the history of another chat after the active chat changes and remembers it', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    view.rerenderWith({ activeId: 'b' })
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос B', 'ответ B'])
    })
    expect(getThread).toHaveBeenLastCalledWith('b')
    expect(setActiveSessionId).toHaveBeenCalledWith('b')
    expect(agent.threadId).toBe('b')
  })

  it('onSwitchToNewThread creates a thread and makes it active', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    act(() => {
      aui().threads.switchToNewThread()
    })
    await waitFor(() => {
      expect(view.props.onSelect).toHaveBeenCalledWith('new')
    })
    expect(view.props.onCreate).toHaveBeenCalledTimes(1)
    expect(setActiveSessionId).toHaveBeenCalledWith('new')
    expect(agent.threadId).toBe('new')
    expect(view.messages()).toEqual([])
  })

  it('sends the run with the threadId of the active chat', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    await startRun('новый вопрос')
    expect(agent.inputs[0]?.threadId).toBe('a')
    emit({ type: EventType.RUN_FINISHED, threadId: 'a', runId: 'r' })

    view.rerenderWith({ activeId: 'b' })
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос B', 'ответ B'])
    })
    await startRun('вопрос в B')
    expect(agent.inputs.at(-1)?.threadId).toBe('b')
  })

  it('onCancel cancels the run of the active chat on the server', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    await startRun('долгий вопрос')
    await act(async () => {
      aui().thread.cancelRun()
      await Promise.resolve()
    })
    expect(cancelRun).toHaveBeenCalledTimes(1)
    expect(cancelRun).toHaveBeenCalledWith('a')
  })

  it('switching chats during an answer neither writes it into the other chat nor cancels the run', async () => {
    const view = mount()
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос A', 'ответ A'])
    })
    await startRun('вопрос')
    emit({ type: EventType.RUN_STARTED, threadId: 'a', runId: 'r' })
    emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'x', role: 'assistant' })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: 'частичный' })

    view.rerenderWith({ activeId: 'b' })
    await waitFor(() => {
      expect(view.messages()).toEqual(['вопрос B', 'ответ B'])
    })

    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: ' хвост' })
    emit({ type: EventType.TEXT_MESSAGE_END, messageId: 'x' })
    emit({ type: EventType.RUN_FINISHED, threadId: 'a', runId: 'r' })

    expect(view.messages()).toEqual(['вопрос B', 'ответ B'])
    expect(cancelRun).not.toHaveBeenCalled()
  })

  it('shows an empty chat and does not create one when there is no active chat', async () => {
    const view = mount({ activeId: null })
    await act(async () => {
      await Promise.resolve()
    })
    expect(view.messages()).toEqual([])
    expect(getThread).not.toHaveBeenCalled()
    expect(view.props.onCreate).not.toHaveBeenCalled()
  })
})

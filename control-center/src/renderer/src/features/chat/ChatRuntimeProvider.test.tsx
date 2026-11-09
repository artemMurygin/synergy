import './test-env'
import { EventType } from '@ag-ui/client'
import type { BaseEvent } from '@ag-ui/client'
import { useAui, useAuiState } from '@assistant-ui/react'
import type { AssistantClient } from '@assistant-ui/react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgent } from '@/lib/backend/agent'
import { cancelRun } from '@/lib/backend/threads.api'
import { ChatRuntimeProvider } from './ChatRuntimeProvider'
import { FakeAgent } from './fake-agent'

vi.mock('@/lib/backend/agent')
vi.mock('@/lib/backend/threads.api')

afterEach(cleanup)

let agent: FakeAgent
const handle: { aui: AssistantClient | null } = { aui: null }

function aui(): AssistantClient {
  if (handle.aui === null) throw new Error('Probe is not mounted')
  return handle.aui
}

function Probe() {
  const client = useAui()
  useEffect(() => {
    handle.aui = client
  })
  const messages = useAuiState((s) => s.thread.messages)
  const running = useAuiState((s) => s.thread.isRunning)
  const texts = messages.map((m) =>
    m.content.map((p) => (p.type === 'text' ? p.text : `[${p.type}]`)).join('')
  )
  return (
    <div>
      <output data-testid="messages">{JSON.stringify(texts)}</output>
      <output data-testid="running">{String(running)}</output>
    </div>
  )
}

const messages = (): unknown => JSON.parse(screen.getByTestId('messages').textContent)

function mount(threadId = 't1') {
  render(
    <ChatRuntimeProvider
      threadId={threadId}
      initialMessages={[
        { id: 'u1', role: 'user', content: 'вопрос' },
        { id: 'a1', role: 'assistant', content: 'ответ' }
      ]}
    >
      <Probe />
    </ChatRuntimeProvider>
  )
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
    // the real stream completes after the run ends
    if (event.type === EventType.RUN_FINISHED) agent.stream.complete()
  })
}

beforeEach(() => {
  agent = new FakeAgent({ url: 'cc-api://backend/agent', threadId: 't1' })
  vi.mocked(createAgent).mockImplementation((threadId: string) => {
    agent.threadId = threadId
    return agent
  })
  vi.mocked(cancelRun).mockResolvedValue(undefined)
})

describe('ChatRuntimeProvider', () => {
  it('shows the initial history in chronological order', async () => {
    mount()
    await waitFor(() => {
      expect(messages()).toEqual(['вопрос', 'ответ'])
    })
    expect(createAgent).toHaveBeenCalledWith('t1')
  })

  it('sends the run with the chat id as threadId', async () => {
    mount('chat-42')
    await startRun('новый вопрос')
    expect(agent.inputs[0]?.threadId).toBe('chat-42')
  })

  it('grows the answer with the AG-UI events and ends the run on RUN_FINISHED', async () => {
    mount()
    await startRun('вопрос 2')
    emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
    emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'x', role: 'assistant' })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: 'Привет' })
    await waitFor(() => {
      expect(messages()).toEqual(['вопрос', 'ответ', 'вопрос 2', 'Привет'])
    })
    expect(screen.getByTestId('running').textContent).toBe('true')
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: ', мир' })
    emit({ type: EventType.TEXT_MESSAGE_END, messageId: 'x' })
    emit({ type: EventType.RUN_FINISHED, threadId: 't1', runId: 'r' })
    await waitFor(() => {
      expect(screen.getByTestId('running').textContent).toBe('false')
    })
    expect(messages()).toEqual(['вопрос', 'ответ', 'вопрос 2', 'Привет, мир'])
  })

  it('cancels the run of this chat on the server and keeps the received text', async () => {
    mount()
    await startRun('долгий вопрос')
    emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
    emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'x', role: 'assistant' })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'x', delta: 'частичный' })
    await waitFor(() => {
      expect(messages()).toEqual(['вопрос', 'ответ', 'долгий вопрос', 'частичный'])
    })
    await act(async () => {
      aui().thread.cancelRun()
      await Promise.resolve()
    })
    expect(cancelRun).toHaveBeenCalledWith('t1')
    expect(messages()).toEqual(['вопрос', 'ответ', 'долгий вопрос', 'частичный'])
  })

  it('does not cancel the server run when the chat is closed during the answer', async () => {
    const view = render(
      <ChatRuntimeProvider threadId="t1" initialMessages={[]}>
        <Probe />
      </ChatRuntimeProvider>
    )
    await startRun('долгий вопрос')
    emit({ type: EventType.RUN_STARTED, threadId: 't1', runId: 'r' })
    view.unmount()
    await act(async () => {
      await Promise.resolve()
    })
    expect(cancelRun).not.toHaveBeenCalled()
  })
})

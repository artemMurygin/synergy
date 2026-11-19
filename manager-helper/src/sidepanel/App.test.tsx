import { EventType, HttpAgent } from '@ag-ui/client'
import { LayoutModeProvider } from '@synergy/ui-kit'
import type { BaseEvent, RunAgentInput } from '@ag-ui/client'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type * as AgentClient from '@/shared/agent-client'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveSection, setActiveSection } from '@/shared/active-section'
import { getActiveSessionId, setActiveSessionId } from '@/shared/active-session'
import { resetAuthState, setAuthState } from '@/shared/auth/auth-state'
import { AskError } from '@/shared/api'
import { RUN_CONFLICT_MESSAGE, RunConflictError, cancelRun, createAgent } from '@/shared/agent-client'
import { createThread, getThread, listThreads, renameThread } from '@/shared/threads-api'
import {
  installChromeFake,
  makeNotification,
  makeRequestNotification,
} from '@/background/notifications/chrome-fake.testing'
import type { ChromeFake } from '@/background/notifications/chrome-fake.testing'
import type * as NotificationsApi from '@/shared/notifications/notifications-api'
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/shared/notifications/notifications-api'
import type * as TasksApi from '@/shared/tasks-api'
import { TaskNotFoundError, getTask, listTasks } from '@/shared/tasks-api'
import { makeDetails, makeTask } from './tasks/fixtures'
import type { Thread, ThreadHistory } from '@/shared/threads-api'
import { App as AppUnderTest } from './App'
import { makeLink } from './telegram/link-fixtures.testing'
import { RUN_POLL_INTERVAL_MS } from './use-thread-run-status'

vi.mock('@/options/telegram/use-telegram-link', () => ({
  useTelegramLink: () => makeLink({ kind: 'unavailable' }),
}))
vi.mock('@/shared/active-session')
vi.mock('@/shared/active-section')
vi.mock('@/shared/agent-client', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentClient>()),
  cancelRun: vi.fn(),
  createAgent: vi.fn(),
}))
vi.mock('@/shared/threads-api')
vi.mock('@/shared/notifications/notifications-api', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationsApi>()),
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))
vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
  searchUsers: vi.fn(),
}))

function App() {
  return (
    <LayoutModeProvider>
      <AppUnderTest />
    </LayoutModeProvider>
  )
}

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
let chromeFake: ChromeFake

function thread(id: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    title: `Чат ${id}`,
    titleIsCustom: false,
    createdAt: '2026-01-01T00:00:00Z',
    lastActivityAt: '2026-01-01T00:00:00Z',
    running: false,
    ...overrides,
  }
}

const history = (running: boolean, ...texts: string[]): ThreadHistory => ({
  running,
  messages: texts.map((text, i) => ({
    id: `m${String(i)}-${text}`,
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: text,
  })),
})

function emit(event: BaseEvent & Record<string, unknown>) {
  act(() => {
    agent.stream.next(event)
  })
}

const startRun = (threadId = 'a') => {
  emit({ type: EventType.RUN_STARTED, threadId, runId: 'r1' })
  emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'a1', role: 'assistant' })
}

const input = () => screen.getByPlaceholderText(/Сообщение агенту/)

function fieldValue(): string {
  const field = input()
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('The composer is not a textarea')
  return field.value
}

async function openApp(activeId: string | null = 'a') {
  vi.mocked(getActiveSessionId).mockResolvedValue(activeId)
  render(<App />)
  if (activeId !== null) {
    await waitFor(() => {
      expect(screen.getByText('вопрос')).toBeTruthy()
    })
  } else {
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Сообщение агенту/)).toBeTruthy()
    })
  }
}

async function ask(text: string) {
  fireEvent.change(input(), { target: { value: text } })
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(false)
  })
  const before = agent.inputs.length
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  await waitFor(() => {
    expect(agent.inputs.length).toBeGreaterThan(before)
  })
}

beforeEach(() => {
  chromeFake = installChromeFake()
  vi.mocked(listNotifications).mockResolvedValue({ items: [], total: 0, limit: 20, page: 0 })
  vi.mocked(getUnreadCount).mockResolvedValue(0)
  vi.mocked(markNotificationRead).mockResolvedValue(0)
  vi.mocked(markAllNotificationsRead).mockResolvedValue(0)
  vi.mocked(listTasks).mockResolvedValue({
    items: [makeTask('t0', { title: 'Задача в списке' })],
    total: 1,
    limit: 50,
    page: 0,
  })
  vi.mocked(getTask).mockImplementation((id) =>
    Promise.resolve(makeDetails(id, { title: `Детали ${id}` })),
  )
  resetAuthState()
  setAuthState({ status: 'authenticated', user: { id: 'u1', login: 'anna' } })
  vi.mocked(getActiveSection).mockResolvedValue('chat')
  vi.mocked(setActiveSection).mockResolvedValue(undefined)
  agent = new FakeAgent({ url: 'http://api.test/agent', threadId: 'a' })
  vi.mocked(createAgent).mockImplementation((threadId: string) => {
    agent.threadId = threadId
    return Promise.resolve(agent)
  })
  vi.mocked(cancelRun).mockResolvedValue(undefined)
  vi.mocked(setActiveSessionId).mockResolvedValue(undefined)
  vi.mocked(listThreads).mockResolvedValue([thread('a'), thread('b')])
  vi.mocked(renameThread).mockImplementation((id, title) =>
    Promise.resolve(thread(id, { title, titleIsCustom: true })),
  )
  vi.mocked(getThread).mockImplementation((id) =>
    Promise.resolve(
      id === 'b' ? history(false, 'вопрос Б', 'ответ Б') : history(false, 'вопрос', 'ответ'),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('App', () => {
  it('shows the empty state and the field when there are no chats', async () => {
    vi.mocked(listThreads).mockResolvedValue([])
    await openApp(null)
    expect(screen.getByText(/Задайте вопрос по ценам/)).toBeTruthy()
    expect(createThread).not.toHaveBeenCalled()
  })

  it('creates the chat on the first question and sends it there', async () => {
    vi.mocked(listThreads).mockResolvedValue([])
    vi.mocked(createThread).mockResolvedValue(thread('new'))
    await openApp(null)
    fireEvent.change(input(), { target: { value: 'первый вопрос' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(false)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(1)
    })
    expect(createThread).toHaveBeenCalledTimes(1)
    expect(agent.threadId).toBe('new')
    expect(agent.inputs[0]?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: 'первый вопрос',
    })
  })

  it('restores the last active chat with its history and renders markdown', async () => {
    vi.mocked(getThread).mockResolvedValue(history(false, 'вопрос', 'ответ **жирный**'))
    await openApp('a')
    expect(screen.getByText('жирный').tagName).toBe('STRONG')
  })

  it('grows the answer by parts and clears the indicator when the run finishes', async () => {
    await openApp()
    await ask('q')
    startRun()
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: 'Часть' })
    await waitFor(() => {
      expect(screen.getByText('Часть')).toBeTruthy()
    })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: ' ответа' })
    await waitFor(() => {
      expect(screen.getByText('Часть ответа')).toBeTruthy()
    })
    expect(screen.getByText('Агент отвечает…')).toBeTruthy()
    emit({ type: EventType.TEXT_MESSAGE_END, messageId: 'a1' })
    emit({ type: EventType.RUN_FINISHED, threadId: 'a', runId: 'r1' })
    act(() => {
      agent.stream.complete()
    })
    await waitFor(() => {
      expect(screen.queryByText('Агент отвечает…')).toBeNull()
    })
    expect(screen.getByText('Часть ответа')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    expect(input().hasAttribute('disabled')).toBe(false)
  })

  it('stop cancels the run on the server and keeps the text with a note', async () => {
    await openApp()
    await ask('q')
    startRun()
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
  })

  it('shows the error and retry sends the last question again', async () => {
    await openApp()
    await ask('мой вопрос')
    emit({ type: EventType.RUN_STARTED, threadId: 'a', runId: 'r1' })
    emit({ type: EventType.RUN_ERROR, message: 'Агент упал' })
    act(() => {
      agent.stream.complete()
    })
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Агент упал')
    })
    expect(screen.getByText('ответ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(2)
    })
    expect(agent.inputs[1]?.messages.at(-1)).toMatchObject({ role: 'user', content: 'мой вопрос' })
    startRun()
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: 'Новый ответ' })
    await waitFor(() => {
      expect(screen.getByText('Новый ответ')).toBeTruthy()
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the typed question when the server is unreachable', async () => {
    await openApp()
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

  describe('chat with a run in progress', () => {
    beforeEach(() => {
      vi.mocked(listThreads).mockResolvedValue([thread('a', { running: true }), thread('b')])
      vi.mocked(getThread).mockResolvedValue(history(true, 'вопрос'))
    })

    it('shows the indicator, blocks sending and offers stop', async () => {
      await openApp()
      expect(screen.getByText('Агент ещё отвечает')).toBeTruthy()
      expect(input().hasAttribute('disabled')).toBe(true)
      expect(screen.queryByRole('button', { name: 'Отправить' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Остановить' }))
      await waitFor(() => {
        expect(cancelRun).toHaveBeenCalledWith('a')
      })
      await waitFor(() => {
        expect(screen.queryByText('Агент ещё отвечает')).toBeNull()
      })
    })

    it('puts the finished answer into the history after polling', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      await openApp()
      expect(screen.getByText('Агент ещё отвечает')).toBeTruthy()
      vi.mocked(getThread).mockResolvedValue(history(false, 'вопрос', 'Готовый ответ'))
      vi.mocked(listThreads).mockResolvedValue([thread('a'), thread('b')])
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS)
      })
      vi.useRealTimers()
      await waitFor(() => {
        expect(screen.getByText('Готовый ответ')).toBeTruthy()
      })
      expect(screen.queryByText('Агент ещё отвечает')).toBeNull()
      expect(input().hasAttribute('disabled')).toBe(false)
      expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    })

    it('reloads the history in place: the draft stays and the provider is not remounted', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      await openApp()
      fireEvent.change(input(), { target: { value: 'черновик' } })
      expect(fieldValue()).toBe('черновик')
      vi.mocked(getThread).mockResolvedValue(history(false, 'вопрос', 'Готовый ответ'))
      vi.mocked(listThreads).mockResolvedValue([thread('a'), thread('b')])
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS)
      })
      vi.useRealTimers()
      await waitFor(() => {
        expect(screen.getByText('Готовый ответ')).toBeTruthy()
      })
      expect(fieldValue()).toBe('черновик')
      expect(createAgent).toHaveBeenCalledTimes(1)
    })

    it('does not apply a stale finished history after switching away and back', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      await openApp()
      vi.mocked(getThread).mockImplementation((id) =>
        Promise.resolve(
          id === 'b'
            ? history(false, 'вопрос Б', 'ответ Б')
            : history(false, 'вопрос', 'Готовый ответ'),
        ),
      )
      vi.mocked(listThreads).mockResolvedValue([thread('a'), thread('b')])
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS)
      })
      vi.useRealTimers()
      await waitFor(() => {
        expect(screen.getByText('Готовый ответ')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Чат b'))
      await waitFor(() => {
        expect(screen.getByText('ответ Б')).toBeTruthy()
      })
      vi.mocked(getThread).mockImplementation((id) =>
        Promise.resolve(
          id === 'b'
            ? history(false, 'вопрос Б', 'ответ Б')
            : history(true, 'вопрос', 'Готовый ответ', 'новый вопрос'),
        ),
      )
      fireEvent.click(screen.getByText('Чат a'))
      await waitFor(() => {
        expect(screen.getByText('новый вопрос')).toBeTruthy()
      })
      expect(screen.getByText('Агент ещё отвечает')).toBeTruthy()
      expect(input().hasAttribute('disabled')).toBe(true)
    })

    it('blocks sending at once after a switch to a running chat, before the list is reloaded', async () => {
      vi.mocked(listThreads).mockResolvedValueOnce([thread('a'), thread('b')])
      vi.mocked(getThread).mockImplementation((id) =>
        Promise.resolve(id === 'b' ? history(true, 'вопрос Б') : history(false, 'вопрос', 'ответ')),
      )
      await openApp()
      expect(input().hasAttribute('disabled')).toBe(false)
      // The list reload after the switch never arrives.
      vi.mocked(listThreads).mockReturnValue(new Promise(() => undefined))
      fireEvent.click(screen.getByText('Чат b'))
      await waitFor(() => {
        expect(screen.getByText('вопрос Б')).toBeTruthy()
      })
      expect(screen.getByText('Агент ещё отвечает')).toBeTruthy()
      expect(input().hasAttribute('disabled')).toBe(true)
      expect(screen.queryByRole('button', { name: 'Отправить' })).toBeNull()
    })
  })

  it('on 409 explains that the agent is still answering and keeps the question', async () => {
    await openApp()
    await ask('мой вопрос')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    act(() => {
      // createAgent turns HTTP 409 into this error (agent-client.test.ts).
      agent.stream.error(new RunConflictError(RUN_CONFLICT_MESSAGE))
    })
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'В этом чате агент ещё отвечает. Дождитесь ответа или остановите его.',
      )
    })
    expect(screen.getByText('Агент ещё отвечает')).toBeTruthy()
    expect(input().hasAttribute('disabled')).toBe(true)
    expect(fieldValue()).toBe('мой вопрос')
    // The run flag is polled until the server run is over.
    vi.mocked(getThread).mockResolvedValue(history(false, 'вопрос', 'ответ'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS)
    })
    vi.useRealTimers()
    await waitFor(() => {
      expect(input().hasAttribute('disabled')).toBe(false)
    })
    expect(fieldValue()).toBe('мой вопрос')
  })

  it('switching chats during an answer does not mix the answers', async () => {
    await openApp('a')
    await ask('q')
    startRun()
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: 'Ответ чата A' })
    await waitFor(() => {
      expect(screen.getByText('Ответ чата A')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Чат b'))
    await waitFor(() => {
      expect(screen.getByText('вопрос Б')).toBeTruthy()
    })
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: ' продолжение' })
    expect(screen.queryByText(/Ответ чата A/)).toBeNull()
    expect(screen.getByText('ответ Б')).toBeTruthy()
    // The run of chat A is dropped locally, not cancelled on the server.
    expect(cancelRun).not.toHaveBeenCalled()
    expect(agent.threadId).toBe('b')
  })

  it('quick search sends its query as a question and names the blank chat by the parameters', async () => {
    vi.mocked(getThread).mockResolvedValue(history(false))
    await openApp0()
    fireEvent.click(screen.getByRole('button', { name: 'Начать подбор' }))
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(1)
    })
    const sent = agent.inputs[0]?.messages.at(-1)
    expect(sent).toMatchObject({ role: 'user' })
    expect(typeof sent?.content === 'string' ? sent.content.length : 0).toBeGreaterThan(10)
    expect(agent.threadId).toBe('a')
    expect(renameThread).toHaveBeenCalledWith('a', expect.stringMatching(/\S/))
  })

  it('next steps send their question into the active chat', async () => {
    vi.mocked(getThread).mockResolvedValue(
      history(false, 'вопрос', '1. Программа А\n2. Программа Б'),
    )
    await openApp0('Программа А')
    fireEvent.click(screen.getByRole('button', { name: 'Вступительные' }))
    await waitFor(() => {
      expect(agent.inputs).toHaveLength(1)
    })
    expect(agent.inputs[0]?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: 'Какие вступительные испытания у программ из списка?',
    })
  })

  it('keeps the chat list next to the thread in a wide panel', async () => {
    await openApp()
    const list = screen.getByRole('list')
    expect(within(list).getByText('Чат a')).toBeTruthy()
    expect(within(list).getByText('Чат b')).toBeTruthy()
  })
})

/** Opens the chat and waits for its history (the text is the visible marker). */
async function openApp0(marker?: string) {
  vi.mocked(getActiveSessionId).mockResolvedValue('a')
  render(<App />)
  if (marker !== undefined) {
    await waitFor(() => {
      expect(screen.getByText(marker)).toBeTruthy()
    })
  } else {
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Начать подбор' })).toBeTruthy()
    })
    await waitFor(() => {
      expect(getThread).toHaveBeenCalled()
    })
  }
}

/** Section button of the rail (tablet) or of the tab bar (mobile). */
function tab(name: string): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Разделы' })).getByRole('button', { name })
}

describe('section switch', () => {
  const chatPane = () => {
    const element = document.querySelector<HTMLElement>('[data-section="chat"]')
    if (element === null) throw new Error('The chat section is not mounted')
    return element
  }

  it('shows the rail with the chat selected on a tablet', async () => {
    await openApp()
    expect(tab('Чаты').getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('region', { name: 'Задачи' })).toBeNull()
  })

  it('switches to the tasks and keeps the chat mounted but hidden', async () => {
    await openApp()
    fireEvent.click(tab('Задачи'))
    expect(screen.getByRole('region', { name: 'Задачи' })).toBeTruthy()
    expect(chatPane().classList.contains('hidden')).toBe(true)
    expect(document.body.contains(input())).toBe(true)
    fireEvent.click(tab('Чаты'))
    expect(chatPane().classList.contains('hidden')).toBe(false)
  })

  it('does not interrupt the answer while the tasks are open', async () => {
    await openApp()
    await ask('q')
    startRun()
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: 'Часть' })
    fireEvent.click(tab('Задачи'))
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a1', delta: ' ответа' })
    fireEvent.click(tab('Чаты'))
    await waitFor(() => {
      expect(screen.getByText('Часть ответа')).toBeTruthy()
    })
    expect(cancelRun).not.toHaveBeenCalled()
  })

  it('remembers the chosen section', async () => {
    await openApp()
    fireEvent.click(tab('Задачи'))
    expect(setActiveSection).toHaveBeenCalledWith('tasks')
  })

  it('opens the remembered section', async () => {
    vi.mocked(getActiveSection).mockResolvedValue('tasks')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Задачи' })).toBeTruthy()
    })
    expect(tab('Задачи').getAttribute('aria-current')).toBe('page')
  })

  it('renders one panel header per section with a single create and settings button', async () => {
    await openApp()
    // The wide panel has two: the header of the section and the header of the chat list.
    expect(within(chatPane()).getAllByRole('button', { name: 'Новый чат' })).toHaveLength(2)
    expect(within(chatPane()).getAllByRole('button', { name: 'Настройки' })).toHaveLength(1)
  })

  it('shows the bottom tab bar instead of the rail in a narrow panel', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 380 })
    try {
      await openApp()
      fireEvent.click(screen.getByRole('button', { name: 'К списку чатов' }))
      expect(screen.getByRole('heading', { name: 'Чаты' })).toBeTruthy()
      expect(tab('Чаты').getAttribute('aria-current')).toBe('page')
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    }
  })

  it.each([
    [700, 'nav-rail'],
    [400, 'tab-bar'],
  ])('at %i px the sections live in the %s', async (width, slot) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    try {
      await openApp()
      expect(screen.getByRole('navigation', { name: 'Разделы' }).getAttribute('data-slot')).toBe(
        slot,
      )
      expect(screen.getByRole('button', { name: 'Чаты' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Задачи' })).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    }
  })

  it('puts notifications and the profile into the rail on a tablet and into the top bar on mobile', async () => {
    await openApp()
    const rail = screen.getByRole('navigation', { name: 'Разделы' })
    expect(within(rail).getByRole('button', { name: /^Профиль/ })).toBeTruthy()
    expect(within(rail).getByRole('button', { name: /^Уведомления/ })).toBeTruthy()
    cleanup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 })
    try {
      await openApp()
      const bar = screen.getByRole('navigation', { name: 'Разделы' })
      expect(within(bar).queryByRole('button', { name: /^Профиль/ })).toBeNull()
      expect(screen.getAllByRole('button', { name: /^Профиль/ })).toHaveLength(1)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    }
  })

  it('is unavailable without a session', async () => {
    resetAuthState()
    setAuthState({ status: 'anonymous', user: null })
    vi.mocked(getActiveSection).mockResolvedValue('tasks')
    await openApp()
    expect(screen.queryByRole('button', { name: 'Задачи' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Задачи' })).toBeNull()
    expect(chatPane().classList.contains('hidden')).toBe(false)
  })
})

describe('notifications', () => {
  const NOTIFICATION = makeNotification('n1', new Date().toISOString(), {
    title: 'Вам назначена задача',
    body: 'ivanov назначил вас ответственным',
    taskId: 't1',
  })

  function lastPort() {
    const result = chromeFake.runtime.connect.mock.results.at(-1)
    if (result?.type !== 'return') throw new Error('no port was opened')
    return result.value
  }

  function bell() {
    return screen.getByRole('button', { name: /^Уведомления/ })
  }

  beforeEach(() => {
    vi.mocked(listNotifications).mockResolvedValue({
      items: [NOTIFICATION],
      total: 1,
      limit: 20,
      page: 0,
    })
    vi.mocked(getUnreadCount).mockResolvedValue(3)
    vi.mocked(markNotificationRead).mockResolvedValue(2)
  })

  it('shows the button with the unread count in the panel header', async () => {
    await openApp()
    expect(await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })).toBeTruthy()
  })

  it('has no notifications button without a session', async () => {
    resetAuthState()
    setAuthState({ status: 'anonymous', user: null })
    await openApp()
    expect(screen.queryByRole('button', { name: /^Уведомления/ })).toBeNull()
  })

  it('opens the list and switches to the task of a clicked notification', async () => {
    await openApp()
    await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })
    fireEvent.click(bell())
    const overlay = screen.getByRole('dialog', { name: 'Уведомления' })
    fireEvent.click(await within(overlay).findByRole('button', { name: /Вам назначена задача/ }))
    expect(markNotificationRead).toHaveBeenCalledWith('n1')
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Задачи' })).toBeTruthy()
    })
    expect(tab('Задачи').getAttribute('aria-current')).toBe('page')
    expect(await screen.findByRole('heading', { name: 'Детали t1' })).toBeTruthy()
    expect(getTask).toHaveBeenCalledWith('t1')
    expect(screen.queryByRole('dialog', { name: 'Уведомления' })).toBeNull()
    expect(await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 2' })).toBeTruthy()
  })

  it('shows "Задача не найдена" for a notification about a deleted task', async () => {
    vi.mocked(getTask).mockRejectedValue(new TaskNotFoundError('нет'))
    await openApp()
    await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })
    fireEvent.click(bell())
    fireEvent.click(await screen.findByRole('button', { name: /Вам назначена задача/ }))
    expect(await screen.findByRole('heading', { name: 'Задача не найдена' })).toBeTruthy()
    expect(markNotificationRead).toHaveBeenCalledWith('n1')
  })

  it('shows a toast for a new notification and opens its task', async () => {
    await openApp()
    await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })
    const fresh = makeNotification('n9', new Date().toISOString(), {
      title: 'Новая задача от petrova',
      taskId: 't9',
    })
    act(() => {
      lastPort().onMessage.emit({
        kind: 'event',
        event: { type: 'notification.created', payload: { notification: fresh, unreadCount: 4 } },
      })
    })
    const toast = await screen.findByRole('status')
    expect(toast.textContent).toContain('Новая задача от petrova')
    expect(screen.getByRole('button', { name: 'Уведомления, непрочитанных: 4' })).toBeTruthy()
    fireEvent.click(within(toast).getByRole('button', { name: /Открыть задачу/ }))
    expect(markNotificationRead).toHaveBeenCalledWith('n9')
    expect(await screen.findByRole('heading', { name: 'Детали t9' })).toBeTruthy()
    expect(screen.queryByText('Новая задача от petrova')).toBeNull()
  })

  it('opens the task left by a click on a system notification', async () => {
    chromeFake.storage.session.store.pendingTarget = { kind: 'task', taskId: 't5' }
    await openApp()
    expect(await screen.findByRole('heading', { name: 'Детали t5' })).toBeTruthy()
    expect(tab('Задачи').getAttribute('aria-current')).toBe('page')
  })

  it('opens the list for a click on the summary system notification', async () => {
    chromeFake.storage.session.store.pendingTarget = { kind: 'notifications' }
    await openApp()
    expect(await screen.findByRole('dialog', { name: 'Уведомления' })).toBeTruthy()
  })

  describe('request notification', () => {
    const REQUEST = makeRequestNotification('n7', new Date().toISOString(), 'req 7')

    beforeEach(() => {
      vi.mocked(listNotifications).mockResolvedValue({
        items: [REQUEST],
        total: 1,
        limit: 20,
        page: 0,
      })
    })

    async function clickRequest() {
      await openApp()
      await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })
      fireEvent.click(bell())
      fireEvent.click(await screen.findByRole('button', { name: /Статус заявки изменён/ }))
    }

    it('opens the request page in a new tab and marks read', async () => {
      chromeFake.storage.sync.store.portalUrl = 'https://portal.example.com'
      await clickRequest()
      await waitFor(() => {
        expect(chromeFake.tabs.create).toHaveBeenCalledWith({
          url: 'https://portal.example.com/requests/req%207',
        })
      })
      expect(markNotificationRead).toHaveBeenCalledWith('n7')
      expect(screen.queryByRole('alert', { name: 'Портал недоступен' })).toBeNull()
    })

    it('marks read and says the portal is unavailable when its address is not set', async () => {
      await clickRequest()
      expect(await screen.findByRole('alert', { name: 'Портал недоступен' })).toBeTruthy()
      expect(markNotificationRead).toHaveBeenCalledWith('n7')
      expect(chromeFake.tabs.create).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /^Уведомления/ })).toBeTruthy()
    })

    it('says the portal is unavailable for a request left by a system notification', async () => {
      chromeFake.storage.session.store.pendingTarget = { kind: 'request', requestId: 'r1' }
      await openApp()
      expect(await screen.findByRole('alert', { name: 'Портал недоступен' })).toBeTruthy()
      expect(chromeFake.tabs.create).not.toHaveBeenCalled()
    })
  })

  it('reads all notifications from the list', async () => {
    await openApp()
    await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })
    fireEvent.click(bell())
    fireEvent.click(screen.getByRole('button', { name: 'Прочитать все' }))
    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Уведомления' })).toBeTruthy()
  })
})

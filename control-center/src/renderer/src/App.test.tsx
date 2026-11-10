import './features/chat/test-env'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Thread } from '@/lib/backend/schema'
import { getThreadHistory, listThreads, deleteThread } from '@/lib/backend/threads.api'
import { useChatStore } from '@/stores/chat.store'
import { useUiStore } from '@/stores/ui.store'
import App from './App'
import { authenticatedSnapshot, installBridgeMock, unauthenticatedSnapshot } from '@/features/auth/auth-test-utils'
import { useSessionStore } from '@/features/auth/session.store'
import { EventType } from '@ag-ui/client'
import { FakeAgent } from '@/features/chat/fake-agent'
import { createAgent } from '@/lib/backend/agent'
import { act } from '@testing-library/react'

vi.mock('@/lib/backend/agent')
vi.mock('@/lib/backend/threads.api')

afterEach(cleanup)

const mk = (id: string, title: string): Thread => ({
  id,
  title,
  titleIsCustom: false,
  createdAt: '2026-01-01T00:00:00Z',
  lastActivityAt: new Date().toISOString(),
  running: false
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

let bridge: ReturnType<typeof installBridgeMock>

beforeEach(() => {
  bridge = installBridgeMock(authenticatedSnapshot)
  useSessionStore.setState({ snapshot: authenticatedSnapshot })
  useChatStore.setState({ activeThreadId: null })
  useUiStore.setState({ section: 'chats' })
  vi.mocked(listThreads).mockResolvedValue([mk('a', 'Первый'), mk('b', 'Второй')])
  vi.mocked(deleteThread).mockResolvedValue(undefined)
  vi.mocked(getThreadHistory).mockImplementation(async (id: string) => ({
    running: false,
    messages: [{ id: `m-${id}`, role: 'user', content: `Вопрос из ${id}` }]
  }))
})

describe('App', () => {
  it('shows the login form and no chats when unauthenticated', async () => {
    bridge = installBridgeMock(unauthenticatedSnapshot)
    useSessionStore.setState({ snapshot: unauthenticatedSnapshot })
    mount()
    expect(await screen.findByRole('button', { name: /войти/i })).toBeTruthy()
    expect(screen.queryByText('Чаты')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Задачи' })).toBeNull()
  })

  it('shows the navigation rail after sign-in and keeps the selected chat when switching sections', async () => {
    const user = mount()
    await user.click(await screen.findByText('Второй'))
    await screen.findByText('Вопрос из b')
    expect(screen.getByRole('navigation')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Задачи' }))
    expect(screen.queryByRole('region', { name: 'Чаты' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Чаты' }))
    expect(await screen.findByText('Вопрос из b')).toBeTruthy()
    expect(useChatStore.getState().activeThreadId).toBe('b')
  })

  it('shows the user login and logs out from the sidebar footer', async () => {
    bridge.logout.mockResolvedValue({ serverRevoked: true })
    const user = mount()
    expect(await screen.findByText('admin')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    await waitFor(() => {
      expect(bridge.logout).toHaveBeenCalledTimes(1)
    })
  })

  it('aborts the running answer and shows the login form when the session is lost', async () => {
    const agent = new FakeAgent({ url: 'cc-api://backend/agent', threadId: 'a' })
    vi.mocked(createAgent).mockReturnValue(agent)
    const abortRun = vi.spyOn(agent, 'abortRun')
    const user = mount()
    await user.click(await screen.findByText('Первый'))
    await screen.findByText('Вопрос из a')
    await user.type(screen.getByRole('textbox'), 'долгий вопрос{Enter}')
    await waitFor(() => {
      expect(agent.inputs.length).toBe(1)
    })
    act(() => {
      agent.stream.next({ type: EventType.RUN_STARTED, threadId: 'a', runId: 'r' })
    })
    act(() => bridge.emit(unauthenticatedSnapshot))
    expect(await screen.findByRole('button', { name: /войти/i })).toBeTruthy()
    await waitFor(() => {
      expect(abortRun).toHaveBeenCalled()
    })
    expect(screen.queryByText('Вопрос из a')).toBeNull()
  })

  it('renders the chat list in the sidebar and the thread in the main slot', async () => {
    mount()
    expect(await screen.findByText('Первый')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Чаты' })).getByText('Чаты')).toBeTruthy()
    expect(screen.getByText('Выберите чат')).toBeTruthy()
  })

  it('shows the history of the chat selected in the list', async () => {
    const user = mount()
    await user.click(await screen.findByText('Второй'))
    expect(await screen.findByText('Вопрос из b')).toBeTruthy()
  })

  async function deleteFirst(user: ReturnType<typeof userEvent.setup>) {
    const list = await screen.findByRole('list')
    await user.click(await within(list).findByText('Первый'))
    await screen.findByText('Вопрос из a')
    const row = within(list).getByText('Первый').closest('li') as HTMLElement
    await user.click(within(row).getByLabelText('Удалить чат'))
    await user.click(within(row).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => {
      expect(screen.queryByText('Вопрос из a')).toBeNull()
    })
  }

  it('moves the thread to the neighbouring chat when the active chat is deleted', async () => {
    const user = mount()
    await deleteFirst(user)
    expect(await screen.findByText('Вопрос из b')).toBeTruthy()
  })

  it('returns the thread to the placeholder when the only chat is deleted', async () => {
    vi.mocked(listThreads).mockResolvedValue([mk('a', 'Первый')])
    const user = mount()
    await deleteFirst(user)
    expect(screen.getByText('Выберите чат')).toBeTruthy()
    expect(useChatStore.getState().activeThreadId).toBeNull()
  })
})

import './features/chat/test-env'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Thread } from '@/lib/backend/schema'
import { getThreadHistory, listThreads, deleteThread } from '@/lib/backend/threads.api'
import { useChatStore } from '@/stores/chat.store'
import App from './App'

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

beforeEach(() => {
  useChatStore.setState({ activeThreadId: null })
  vi.mocked(listThreads).mockResolvedValue([mk('a', 'Первый'), mk('b', 'Второй')])
  vi.mocked(deleteThread).mockResolvedValue(undefined)
  vi.mocked(getThreadHistory).mockImplementation(async (id: string) => ({
    running: false,
    messages: [{ id: `m-${id}`, role: 'user', content: `Вопрос из ${id}` }]
  }))
})

describe('App', () => {
  it('renders the chat list in the sidebar and the thread in the main slot', async () => {
    mount()
    expect(await screen.findByText('Первый')).toBeTruthy()
    expect(screen.getByText('Чаты')).toBeTruthy()
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

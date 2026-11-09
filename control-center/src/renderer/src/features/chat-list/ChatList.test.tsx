import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Thread } from '@/lib/backend/schema'
import * as threadsApi from '@/lib/backend/threads.api'
import { useChatStore } from '@/stores/chat.store'
import { ChatList } from './ChatList'

vi.mock('@/lib/backend/threads.api')

afterEach(cleanup)

const mk = (id: string, title: string, extra: Partial<Thread> = {}): Thread => ({
  id,
  title,
  titleIsCustom: false,
  createdAt: '2026-01-01T00:00:00Z',
  lastActivityAt: new Date().toISOString(),
  running: false,
  ...extra
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ChatList />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

beforeEach(() => {
  useChatStore.setState({ activeThreadId: null })
})

describe('ChatList', () => {
  it('shows a skeleton while loading', () => {
    vi.mocked(threadsApi.listThreads).mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByRole('status', { name: 'Загрузка чатов' })).toBeTruthy()
  })

  it('renders threads in the order given by the backend', async () => {
    vi.mocked(threadsApi.listThreads).mockResolvedValue([
      mk('a', 'Первый'),
      mk('b', 'Второй'),
      mk('c', 'Третий')
    ])
    setup()
    await screen.findByText('Первый')
    const titles = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(titles[0]).toContain('Первый')
    expect(titles[1]).toContain('Второй')
    expect(titles[2]).toContain('Третий')
  })

  it('highlights the active chat', async () => {
    vi.mocked(threadsApi.listThreads).mockResolvedValue([mk('a', 'Первый'), mk('b', 'Второй')])
    useChatStore.setState({ activeThreadId: 'b' })
    setup()
    await screen.findByText('Второй')
    expect(screen.getByRole('button', { name: /Второй/ }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: /Первый/ }).getAttribute('aria-current')).toBe(null)
  })

  it('selects a chat on click', async () => {
    vi.mocked(threadsApi.listThreads).mockResolvedValue([mk('a', 'Первый')])
    const user = setup()
    await user.click(await screen.findByRole('button', { name: /Первый/ }))
    expect(useChatStore.getState().activeThreadId).toBe('a')
  })

  it('shows the empty state and creates a chat from it', async () => {
    vi.mocked(threadsApi.listThreads).mockResolvedValue([])
    vi.mocked(threadsApi.createThread).mockResolvedValue(mk('new', 'Новый чат'))
    const user = setup()
    expect(await screen.findByText('Чатов пока нет')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Начать чат' }))
    await waitFor(() => expect(threadsApi.createThread).toHaveBeenCalled())
    await waitFor(() => expect(useChatStore.getState().activeThreadId).toBe('new'))
  })

  it('creates a chat from the header button', async () => {
    vi.mocked(threadsApi.listThreads).mockResolvedValue([mk('a', 'Первый')])
    vi.mocked(threadsApi.createThread).mockResolvedValue(mk('new', 'Новый чат'))
    const user = setup()
    await screen.findByText('Первый')
    await user.click(screen.getByRole('button', { name: 'Новый чат' }))
    await waitFor(() => expect(useChatStore.getState().activeThreadId).toBe('new'))
  })

  it('shows an error and retries the list request', async () => {
    vi.mocked(threadsApi.listThreads)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce([mk('a', 'Первый')])
    const user = setup()
    expect(await screen.findByText('Не удалось загрузить чаты')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Первый')).toBeTruthy()
    expect(threadsApi.listThreads).toHaveBeenCalledTimes(2)
  })

  it('renames a chat through the mutation', async () => {
    vi.mocked(threadsApi.listThreads).mockResolvedValue([mk('a', 'Первый')])
    vi.mocked(threadsApi.renameThread).mockResolvedValue(mk('a', 'Другое'))
    const user = setup()
    await screen.findByText('Первый')
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    await user.type(input, 'Другое{Enter}')
    await waitFor(() => expect(threadsApi.renameThread).toHaveBeenCalledWith('a', 'Другое'))
  })

  it('deletes a chat after confirmation', async () => {
    vi.mocked(threadsApi.listThreads).mockResolvedValue([mk('a', 'Первый')])
    vi.mocked(threadsApi.deleteThread).mockResolvedValue(undefined)
    const user = setup()
    const row = (await screen.findByText('Первый')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Удалить чат' }))
    await user.click(within(row).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(threadsApi.deleteThread).toHaveBeenCalledWith('a'))
  })
})

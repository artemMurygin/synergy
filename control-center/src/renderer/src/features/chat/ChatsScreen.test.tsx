import './test-env'
import { LayoutModeProvider, ToastProvider } from '@synergy/ui-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgent } from '@/lib/backend/agent'
import { createThread, deleteThread, getThreadHistory, listThreads, renameThread } from '@/lib/backend/threads.api'
import { useChatStore } from '@/stores/chat.store'
import { FakeAgent } from './fake-agent'
import { ChatsScreen } from './ChatsScreen'

vi.mock('@/lib/backend/agent')
vi.mock('@/lib/backend/threads.api')

afterEach(cleanup)

const now = new Date().toISOString()
const thread = (id: string, title: string, running = false) => ({
  id,
  title,
  titleIsCustom: false,
  createdAt: now,
  lastActivityAt: now,
  running
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <LayoutModeProvider mode="desktop">
        <ToastProvider>
          <ChatsScreen />
        </ToastProvider>
      </LayoutModeProvider>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(createAgent).mockImplementation((threadId: string) => new FakeAgent({ url: 'cc-api://backend/agent', threadId }))
  vi.mocked(listThreads).mockResolvedValue([thread('t1', 'Цены на MBA'), thread('t2', 'Скидки', true)])
  vi.mocked(getThreadHistory).mockResolvedValue({ running: false, messages: [] })
  useChatStore.setState({ activeThreadId: null })
})

describe('ChatsScreen', () => {
  it('shows the chats of the package list and opens the chosen one on the right', async () => {
    const user = mount()
    await user.click(await screen.findByRole('button', { name: /Цены на MBA/ }))
    expect(useChatStore.getState().activeThreadId).toBe('t1')
    expect(await screen.findByRole('heading', { name: 'Цены на MBA' })).toBeTruthy()
  })

  it('marks the chat where the agent is still answering', async () => {
    mount()
    const row = (await screen.findByText('Скидки')).closest('li')
    expect(row?.querySelector('[aria-label="Агент отвечает"]')).not.toBeNull()
    const idle = screen.getByText('Цены на MBA').closest('li')
    expect(idle?.querySelector('[aria-label="Агент отвечает"]')).toBeNull()
  })

  it('creates a chat from the list header', async () => {
    vi.mocked(createThread).mockResolvedValue(thread('t3', 'Новый чат'))
    const user = mount()
    await screen.findByText('Цены на MBA')
    await user.click(within(screen.getByRole('complementary', { name: 'Список чатов' })).getByRole('button', { name: 'Новый чат' }))
    await waitFor(() => {
      expect(createThread).toHaveBeenCalled()
    })
  })

  it('hides the list so the chat takes its place, and brings it back', async () => {
    const user = mount()
    await screen.findByText('Цены на MBA')
    await user.click(screen.getByRole('button', { name: 'Скрыть список чатов' }))
    expect(screen.queryByRole('complementary', { name: 'Список чатов' })).toBeNull()
    expect(screen.queryByText('Цены на MBA')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Показать список чатов' }))
    expect(await screen.findByText('Цены на MBA')).toBeTruthy()
  })

  it('keeps the list hidden for the session', async () => {
    const user = mount()
    await user.click(await screen.findByRole('button', { name: 'Скрыть список чатов' }))
    cleanup()
    mount()
    expect(await screen.findByRole('button', { name: 'Показать список чатов' })).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: 'Список чатов' })).toBeNull()
  })

  it('searches the chats by a substring and brings the list back when cleared', async () => {
    const user = mount()
    await screen.findByText('Цены на MBA')
    const search = screen.getByRole('searchbox', { name: 'Поиск' })
    await user.type(search, 'скид')
    expect(screen.getByText('Скидки')).toBeTruthy()
    expect(screen.queryByText('Цены на MBA')).toBeNull()
    await user.clear(search)
    expect(screen.getByText('Цены на MBA')).toBeTruthy()
  })

  it('says nothing was found when no chat matches', async () => {
    const user = mount()
    await screen.findByText('Цены на MBA')
    await user.type(screen.getByRole('searchbox', { name: 'Поиск' }), 'zzz')
    expect(screen.getByText('Ничего не найдено')).toBeTruthy()
  })

  it('shows the chat header of the package with the list buttons while the list is hidden', async () => {
    const user = mount()
    await user.click(await screen.findByRole('button', { name: /Цены на MBA/ }))
    await screen.findByRole('heading', { name: 'Цены на MBA' })
    await user.click(screen.getByRole('button', { name: 'Скрыть список чатов' }))
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('button', { name: 'Показать список чатов' })).toBeTruthy()
    expect(within(header).getByRole('button', { name: 'Новый чат' })).toBeTruthy()
    expect(within(header).getByRole('heading', { name: 'Цены на MBA' })).toBeTruthy()
  })

  it('shows the start window instead of "Выберите чат" when no chat is open', async () => {
    mount()
    expect(await screen.findByText('Чем помочь?')).toBeTruthy()
    expect(screen.queryByText('Выберите чат')).toBeNull()
  })

  it('opens the search of the chat from the header', async () => {
    const user = mount()
    await user.click(await screen.findByRole('button', { name: /Цены на MBA/ }))
    await user.click(await screen.findByRole('button', { name: 'Поиск по чату' }))
    expect(await screen.findByRole('search')).toBeTruthy()
  })

  it('deletes the chat from the menu of the header after the confirmation', async () => {
    vi.mocked(deleteThread).mockResolvedValue(undefined)
    getHistoryWithMessage()
    const user = mount()
    await user.click(await screen.findByRole('button', { name: /Цены на MBA/ }))
    await user.click(within(chatHeader(await screen.findByRole('heading', { name: 'Цены на MBA' }))).getByRole('button', { name: 'Меню чата' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }))
    await user.click(await screen.findByRole('button', { name: 'Удалить' }))
    await waitFor(() => {
      expect(deleteThread).toHaveBeenCalledWith('t1')
    })
  })

  it('renames the chat from the menu of the header', async () => {
    vi.mocked(renameThread).mockResolvedValue(thread('t1', 'Новое имя'))
    getHistoryWithMessage()
    const user = mount()
    await user.click(await screen.findByRole('button', { name: /Цены на MBA/ }))
    await user.click(within(chatHeader(await screen.findByRole('heading', { name: 'Цены на MBA' }))).getByRole('button', { name: 'Меню чата' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Переименовать' }))
    const field = await screen.findByDisplayValue('Цены на MBA')
    await user.clear(field)
    await user.type(field, 'Новое имя{Enter}')
    await waitFor(() => {
      expect(renameThread).toHaveBeenCalledWith('t1', 'Новое имя')
    })
  })

  it('shows a toast when the list cannot rename a chat', async () => {
    vi.mocked(renameThread).mockRejectedValue(new Error('boom'))
    const user = mount()
    await screen.findByText('Цены на MBA')
    const row = screen.getByText('Цены на MBA').closest('li')
    if (row === null) throw new Error('row')
    await user.click(within(row).getByRole('button', { name: /Действия|Меню|ещё/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Переименовать' }))
    const field = await screen.findByDisplayValue('Цены на MBA')
    await user.clear(field)
    await user.type(field, 'X{Enter}')
    expect(await screen.findByText(/Не удалось переименовать/)).toBeTruthy()
  })
})

function getHistoryWithMessage() {
  vi.mocked(getThreadHistory).mockResolvedValue({
    running: false,
    messages: [{ id: 'u1', role: 'user', content: 'вопрос', attachments: [], source: 'run' }]
  })
}

function chatHeader(heading: HTMLElement): HTMLElement {
  const header = heading.closest('header')
  if (header === null) throw new Error('chat header not found')
  return header
}

import './test-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session.store'
import * as tasksApi from '@/lib/backend/tasks.api'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { TasksPage } from './TasksPage'

vi.mock('@/lib/backend/tasks.api')
vi.mock('@/lib/backend/users.api')

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
  useTasksStore.setState(INITIAL_TASKS_STATE)
  useSessionStore.setState({ snapshot: { state: 'authenticated', user: { id: 'u1', login: 'anna' } } })
  vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [], total: 0, limit: 20, page: 1 })
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TasksPage />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe('TasksPage · header', () => {
  it('shows the task count once the list total is known', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [], total: 128, limit: 20, page: 1 })
    setup()
    expect(screen.queryByText(/^\d+ задач/)).toBeNull()
    expect(await screen.findByText('128 задач')).toBeTruthy()
    // one request: the header reuses the list query
    const listCalls = vi.mocked(tasksApi.listTasks).mock.calls.filter(([filters]) => !filters?.overdue)
    expect(listCalls).toHaveLength(1)
  })

  it('declines the count', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [], total: 1, limit: 20, page: 1 })
    setup()
    expect(await screen.findByText('1 задача')).toBeTruthy()
  })
})

describe('TasksPage · create dialog', () => {
  it('opens from the header button and returns focus to it on close', async () => {
    const user = setup()
    const button = screen.getByRole('button', { name: 'Новая задача' })
    await user.click(button)
    await screen.findByRole('dialog', { name: 'Новая задача' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('opens from the empty state action', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Создать задачу' }))
    expect(await screen.findByRole('dialog', { name: 'Новая задача' })).toBeTruthy()
  })
})

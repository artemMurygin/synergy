import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session.store'
import { BackendError } from '@/lib/backend/errors'
import * as tasksApi from '@/lib/backend/tasks.api'
import type { Task, TaskPage } from '@/lib/backend/tasks.schema'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { TaskList } from './TaskList'
import { mkTask } from './test-utils'

vi.mock('@/lib/backend/tasks.api')
vi.mock('@/lib/backend/users.api')

afterEach(cleanup)

const page = (items: Task[], extra: Partial<TaskPage> = {}): TaskPage => ({
  items,
  total: items.length,
  limit: 20,
  page: 1,
  ...extra
})

function setup(onCreateTask = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TaskList onCreateTask={onCreateTask} />
    </QueryClientProvider>
  )
  return { onCreateTask, user: userEvent.setup() }
}

beforeEach(() => {
  vi.resetAllMocks()
  useTasksStore.setState(INITIAL_TASKS_STATE)
  useSessionStore.setState({ snapshot: { state: 'authenticated', user: { id: 'u1', login: 'admin' } } })
})

describe('TaskList', () => {
  it('shows skeleton rows while loading', () => {
    vi.mocked(tasksApi.listTasks).mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByRole('status', { name: 'Загрузка задач' })).toBeTruthy()
  })

  it('renders the tasks of the page', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([mkTask('a'), mkTask('b')]))
    setup()
    await screen.findByText('Задача a')
    expect(screen.getByText('Задача b')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Загрузка задач' })).toBeNull()
  })

  it('requests the list with view, status, search, sort and page', async () => {
    useTasksStore.setState({ view: 'mine', status: 'in_progress', search: 'кп', sort: 'deadline', order: 'asc', page: 2 })
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([mkTask('a')], { total: 30, page: 2 }))
    setup()
    await screen.findByText('Задача a')
    expect(tasksApi.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeId: 'u1',
        status: 'in_progress',
        search: 'кп',
        sort: 'deadline',
        order: 'asc',
        page: 2
      })
    )
  })

  it('highlights the selected task and selects on click', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([mkTask('a'), mkTask('b')]))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Открыть задачу: Задача b' }))
    expect(useTasksStore.getState().selectedTaskId).toBe('b')
    expect(screen.getByRole('button', { name: 'Открыть задачу: Задача b' }).getAttribute('aria-current')).toBe('true')
  })

  it('shows the empty state with a create action when there are no filters', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([]))
    const { user, onCreateTask } = setup()
    await screen.findByText('Задач пока нет')
    await user.click(screen.getByRole('button', { name: 'Создать задачу' }))
    expect(onCreateTask).toHaveBeenCalled()
  })

  it('shows the empty state under filters with a reset action', async () => {
    useTasksStore.setState({ view: 'mine', page: 1 })
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([]))
    const { user } = setup()
    await screen.findByText('Ничего не найдено')
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(useTasksStore.getState().view).toBe('all')
  })

  it('shows an error with retry when the first load fails', async () => {
    vi.mocked(tasksApi.listTasks).mockRejectedValueOnce(new BackendError('boom')).mockResolvedValue(page([mkTask('a')]))
    const { user } = setup()
    await screen.findByText('Не удалось загрузить задачи')
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    await screen.findByText('Задача a')
  })

  it('keeps loaded rows and shows a banner when a refresh fails', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([mkTask('a')]))
    vi.mocked(tasksApi.updateTask).mockResolvedValue(mkTask('a', { status: 'done' }))
    const { user } = setup()
    await screen.findByText('Задача a')
    // the refetch after the status change fails
    vi.mocked(tasksApi.listTasks).mockRejectedValue(new BackendError('boom'))
    await user.click(screen.getByRole('button', { name: 'Отметить выполненной: Задача a' }))
    const banner = await screen.findByText(/Не удалось обновить список/)
    const alert = banner.closest('[role="alert"]') as HTMLElement
    expect(screen.getByText('Задача a')).toBeTruthy()
    expect(within(alert).getByRole('button', { name: 'Повторить' })).toBeTruthy()
  })

  it('paginates', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([mkTask('a')], { total: 45 }))
    const { user } = setup()
    await screen.findByText('Страница 1 из 3')
    expect((screen.getByRole('button', { name: 'Предыдущая страница' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Следующая страница' }))
    expect(useTasksStore.getState().page).toBe(2)
    await waitFor(() => expect(tasksApi.listTasks).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('changes the status from a row and sends only the status', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([mkTask('a')]))
    vi.mocked(tasksApi.updateTask).mockResolvedValue(mkTask('a', { status: 'done' }))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Отметить выполненной: Задача a' }))
    expect(tasksApi.updateTask).toHaveBeenCalledWith('a', { status: 'done' })
  })

  it('rolls the status back and tells the user when the server refuses', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue(page([mkTask('a')]))
    vi.mocked(tasksApi.updateTask).mockRejectedValue(new BackendError('boom'))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Отметить выполненной: Задача a' }))
    await screen.findByText(/Не удалось изменить статус/)
    expect(screen.getByText('К выполнению')).toBeTruthy()
  })

  it('steps back a page when the current one became empty after a deletion', async () => {
    useTasksStore.setState({ page: 2 })
    vi.mocked(tasksApi.listTasks).mockImplementation((filters) =>
      Promise.resolve(
        filters.page === 2 ? page([], { total: 20, page: 2 }) : page([mkTask('a')], { total: 20, page: 1 })
      )
    )
    setup()
    await screen.findByText('Задача a')
    expect(useTasksStore.getState().page).toBe(1)
    expect(screen.queryByText('Задач пока нет')).toBeNull()
  })
})

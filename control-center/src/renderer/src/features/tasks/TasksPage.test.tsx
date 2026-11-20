import './test-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session.store'
import * as tasksApi from '@/lib/backend/tasks.api'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { TasksPage } from './TasksPage'
import { mkTask } from './test-utils'
import { Desktop } from './test-wrapper'

vi.mock('@/lib/backend/tasks.api')
vi.mock('@/lib/backend/users.api')

afterEach(cleanup)

const EMPTY = { items: [], total: 0, limit: 20, page: 1 }

beforeEach(() => {
  vi.resetAllMocks()
  useTasksStore.setState(INITIAL_TASKS_STATE)
  useUiStore.setState({ section: 'tasks' })
  useSessionStore.setState({ snapshot: { state: 'authenticated', user: { id: 'u1', login: 'anna' } } })
  vi.mocked(tasksApi.listTasks).mockResolvedValue(EMPTY)
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Desktop>
        <TasksPage />
      </Desktop>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

/** Filters of the calls of the list itself (the overdue badge asks for its own total). */
const listFilters = () =>
  vi
    .mocked(tasksApi.listTasks)
    .mock.calls.map(([filters]) => filters)
    .filter((filters) => !filters.overdue || filters.limit !== 1)

describe('TasksPage · header', () => {
  it('shows the task count once the list total is known', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ ...EMPTY, total: 128 })
    setup()
    expect(screen.queryByText(/^\d+ задач/)).toBeNull()
    expect(await screen.findByText('128 задач')).toBeTruthy()
  })

  it('shows "Загрузка…" in the capsule until the total is known', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ ...EMPTY, total: 3 })
    setup()
    expect(screen.getByText('Загрузка…')).toBeTruthy()
    expect(await screen.findByText('3 задачи')).toBeTruthy()
    expect(screen.queryByText('Загрузка…')).toBeNull()
  })

  it('declines the count', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ ...EMPTY, total: 1 })
    setup()
    expect(await screen.findByText('1 задача')).toBeTruthy()
  })
})

describe('TasksPage · views and filters', () => {
  it('opens on "Мои" and asks for the tasks assigned to the user', async () => {
    setup()
    expect(screen.getByRole('button', { name: 'Мои', pressed: true })).toBeTruthy()
    await waitFor(() => {
      expect(listFilters()[0]).toMatchObject({ assigneeId: 'u1' })
    })
  })

  it('shows every view as a segment at once', () => {
    setup()
    const group = screen.getByRole('group', { name: 'Представление' })
    for (const name of ['Все', 'Мои', 'Я наблюдаю', 'Созданные мной', 'Просрочено']) {
      expect(within(group).getByRole('button', { name })).toBeTruthy()
    }
  })

  it('switches the view and returns to the first page', async () => {
    useTasksStore.setState({ page: 3 })
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Я наблюдаю' }))
    expect(useTasksStore.getState()).toMatchObject({ view: 'watching', page: 1 })
    await waitFor(() => {
      expect(listFilters().at(-1)).toMatchObject({ watcherId: 'u1', page: 1 })
    })
  })

  it('shows the overdue count on the segment', async () => {
    vi.mocked(tasksApi.listTasks).mockImplementation((filters) =>
      Promise.resolve(filters.overdue ? { ...EMPTY, total: 7 } : EMPTY)
    )
    setup()
    expect(await within(screen.getByRole('button', { name: /Просрочено/ })).findByText('7')).toBeTruthy()
  })

  it('combines the view, the status and the search into one request', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /^Статус/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'В работе' }))
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по названию' }), 'отчёт')
    await waitFor(() => {
      expect(listFilters().at(-1)).toMatchObject({ assigneeId: 'u1', status: 'in_progress', search: 'отчёт' })
    })
  })

  it('sends the search after a pause in typing, not on every key', async () => {
    const user = setup()
    await waitFor(() => {
      expect(listFilters().length).toBeGreaterThan(0)
    })
    const before = listFilters().length
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по названию' }), 'abcd')
    expect(listFilters()).toHaveLength(before)
    await waitFor(() => {
      expect(listFilters().at(-1)).toMatchObject({ search: 'abcd' })
    })
    expect(listFilters().filter((f) => f.search !== undefined)).toHaveLength(1)
  })

  it('sorts by deadline ascending', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /^Сортировка/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'По дедлайну' }))
    await waitFor(() => {
      expect(listFilters().at(-1)).toMatchObject({ sort: 'deadline', order: 'asc' })
    })
  })
})

describe('TasksPage · list', () => {
  it('renders the tasks of the page and the range', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({
      items: [mkTask('a'), mkTask('b')],
      total: 45,
      limit: 20,
      page: 1
    })
    setup()
    expect(await screen.findByText('Задача a')).toBeTruthy()
    expect(screen.getByText('Задача b')).toBeTruthy()
    expect(screen.getByText('1–20 из 45')).toBeTruthy()
  })

  it('paginates', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [mkTask('a')], total: 45, limit: 20, page: 1 })
    const user = setup()
    await screen.findByText('Задача a')
    await user.click(screen.getByRole('button', { name: 'Следующая страница' }))
    expect(useTasksStore.getState().page).toBe(2)
    await waitFor(() => {
      expect(listFilters().at(-1)).toMatchObject({ page: 2 })
    })
  })

  it('opens the task of the row in the panel beside the list', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [mkTask('a')], total: 1, limit: 20, page: 1 })
    vi.mocked(tasksApi.getTask).mockResolvedValue({ ...mkTask('a'), attachments: [] })
    const user = setup()
    await user.click(await screen.findByText('Задача a'))
    expect(useTasksStore.getState().selectedTaskId).toBe('a')
    expect(await screen.findByRole('complementary', { name: 'Детали задачи' })).toBeTruthy()
  })

  it('shows the empty state of "Мои" with a create action that opens the dialog', async () => {
    const user = setup()
    expect(await screen.findByText('Нет задач на вас')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Создать задачу' }))
    expect(await screen.findByRole('dialog', { name: 'Новая задача' })).toBeTruthy()
  })

  it('says nothing was found for a search', async () => {
    const user = setup()
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по названию' }), 'нет такой')
    expect(await screen.findByText('Ничего не найдено', undefined, { timeout: 2000 })).toBeTruthy()
  })

  it('resets the search and the filters from the empty search result', async () => {
    const user = setup()
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по названию' }), 'нет такой')
    await user.click(await screen.findByRole('button', { name: 'Сбросить фильтры' }, { timeout: 2000 }))
    expect(useTasksStore.getState().search).toBe('')
    expect(useTasksStore.getState().view).toBe(INITIAL_TASKS_STATE.view)
  })

  it('shows an error with retry when the first load fails', async () => {
    vi.mocked(tasksApi.listTasks).mockRejectedValue(new Error('boom'))
    const user = setup()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Нет связи с сервером')
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [mkTask('a')], total: 1, limit: 20, page: 1 })
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Задача a')).toBeTruthy()
  })

  it('changes the status from a row and sends only the status', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [mkTask('a')], total: 1, limit: 20, page: 1 })
    vi.mocked(tasksApi.updateTask).mockResolvedValue(mkTask('a', { status: 'done' }))
    const user = setup()
    await screen.findByText('Задача a')
    const row = screen.getByText('Задача a').closest('li')
    if (row === null) throw new Error('row not found')
    await user.click(within(row).getByRole('button', { name: /статус|Статус|выполн/i }))
    await waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalled()
    })
    expect(vi.mocked(tasksApi.updateTask).mock.calls[0]?.[1]).toHaveProperty('status')
    expect(Object.keys(vi.mocked(tasksApi.updateTask).mock.calls[0]?.[1] ?? {})).toEqual(['status'])
  })

  it('steps back a page when the current one became empty after a deletion', async () => {
    useTasksStore.setState({ page: 2 })
    vi.mocked(tasksApi.listTasks).mockImplementation((filters) =>
      Promise.resolve(
        filters.page === 2
          ? { items: [], total: 20, limit: 20, page: 2 }
          : { items: [mkTask('a')], total: 20, limit: 20, page: 1 }
      )
    )
    setup()
    expect(await screen.findByText('Задача a')).toBeTruthy()
    expect(useTasksStore.getState().page).toBe(1)
  })
})

describe('TasksPage · create dialog', () => {
  it('opens from the header button and returns focus to it on close', async () => {
    const user = setup()
    const button = screen.getByRole('button', { name: 'Новая задача' })
    await user.click(button)
    await screen.findByRole('dialog', { name: 'Новая задача' })
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(button)
    })
  })
})

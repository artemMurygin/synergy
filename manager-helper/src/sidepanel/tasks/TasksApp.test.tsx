import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { resetAuthState, setAuthState } from '@/shared/auth/auth-state'
import { TaskNotFoundError, getTask, listTasks, searchUsers } from '@/shared/tasks-api'
import type { ListTasksParams } from '@/shared/tasks-api'
import { makeDetails, makeTask } from './fixtures'
import { TasksApp } from './TasksApp'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
  searchUsers: vi.fn(),
}))

function resizeTo(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

const A = makeTask('a', { title: 'Отчёт' })
const B = makeTask('b', { title: 'КП', status: 'in_progress' })

beforeEach(() => {
  setAuthState({ status: 'authenticated', user: { id: 'u1', login: 'anna' } })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 380 })
  vi.mocked(listTasks).mockReset()
  vi.mocked(getTask).mockReset()
  vi.mocked(searchUsers).mockReset()
  vi.mocked(listTasks).mockImplementation((params: ListTasksParams) =>
    Promise.resolve({
      items: params.status === 'todo' ? [A] : [B],
      total: 1,
      limit: 50,
      page: 0,
    }),
  )
  vi.mocked(getTask).mockImplementation((id) =>
    Promise.resolve(makeDetails(id, { title: id === 'a' ? 'Отчёт' : 'КП' })),
  )
})

afterEach(() => {
  resetAuthState()
})

describe('TasksApp', () => {
  it('loads the open tasks of the current user and renders the switcher in the header', async () => {
    render(<TasksApp switcher={<div>переключатель</div>} />)
    expect(await screen.findByRole('button', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'КП' })).toBeTruthy()
    expect(screen.getByText('переключатель')).toBeTruthy()
    expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 'u1' }))
  })

  it('opens the details of a task, "Назад" returns to the same list', async () => {
    render(<TasksApp switcher={null} />)
    const row = await screen.findByRole('button', { name: 'Отчёт' })
    const list = row.closest('ul')
    fireEvent.click(row)
    expect(await screen.findByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Отметить выполненной: Отчёт' })?.closest('[hidden]'),
    ).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    const back = screen.getByRole('button', { name: 'Отчёт' })
    expect(back.closest('ul')).toBe(list)
    expect(back.closest('[hidden]')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Отчёт' })).toBeNull()
  })

  it('returns to the list and reloads when the opened task is gone (404)', async () => {
    vi.mocked(getTask).mockRejectedValue(new TaskNotFoundError('нет'))
    render(<TasksApp switcher={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    expect((await screen.findByRole('status', { name: 'Сообщение' })).textContent).toMatch(
      /не найдена/,
    )
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
    })
    expect(vi.mocked(listTasks).mock.calls.length).toBeGreaterThan(2)
  })

  it('opens the quick create form from the header and from the empty state', async () => {
    vi.mocked(listTasks).mockResolvedValue({ items: [], total: 0, limit: 50, page: 0 })
    render(<TasksApp switcher={null} />)
    expect(screen.queryByRole('textbox', { name: 'Название задачи' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Создать задачу' }))
    expect(screen.getByRole('textbox', { name: 'Название задачи' })).toBeTruthy()
  })

  it('shows two columns with a hint in a wide panel and no "Назад"', async () => {
    resizeTo(700)
    render(<TasksApp switcher={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }).then((b) => b))
    expect(await screen.findByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'КП' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
  })

  it('asks to pick a task in a wide panel until one is selected', async () => {
    resizeTo(700)
    render(<TasksApp switcher={null} />)
    await screen.findByRole('button', { name: 'Отчёт' })
    expect(screen.getByText('Выберите задачу')).toBeTruthy()
  })

  it('keeps the selected task when the panel narrows', async () => {
    resizeTo(700)
    render(<TasksApp switcher={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    resizeTo(400)
    expect(screen.getByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy()
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { resetAuthState, setAuthState } from '@/shared/auth/auth-state'
import { TaskNotFoundError, getTask, listTasks, searchUsers } from '@/shared/tasks-api'
import { makeDetails, makeTask } from './fixtures'
import { LayoutModeProvider } from '@synergy/ui-kit'
import { TasksApp } from './TasksApp'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
  searchUsers: vi.fn(),
  deleteTask: vi.fn(),
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
  vi.mocked(searchUsers).mockReset().mockResolvedValue({ items: [], total: 0, limit: 20, page: 0 })
  vi.mocked(listTasks).mockImplementation(() =>
    Promise.resolve({
      items: [A, B],
      total: 2,
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

function renderApp(props: Parameters<typeof TasksApp>[0] = {}) {
  return render(
    <LayoutModeProvider>
      <TasksApp {...props} />
    </LayoutModeProvider>,
  )
}

describe('TasksApp', () => {
  it('loads "Мои" of the current user and renders the trailing slot', async () => {
    renderApp({ trailing: <div>уведомления</div> })
    expect(await screen.findByRole('button', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'КП' })).toBeTruthy()
    expect(screen.getByText('уведомления')).toBeTruthy()
    expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 'u1' }))
  })

  it('renders nothing but the section without a signed-in user', () => {
    resetAuthState()
    renderApp()
    expect(screen.getByRole('region', { name: 'Задачи' })).toBeTruthy()
    expect(listTasks).not.toHaveBeenCalled()
  })

  it('opens the details in a narrow panel and "Назад" returns to the same list', async () => {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    expect(await screen.findByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('button', { name: 'Отчёт' }).closest('[hidden]')).toBeNull()
  })

  it('creates a task through the quick sheet in a narrow panel and the dialog in a wide one', async () => {
    renderApp()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Новая задача' }))
    expect(await screen.findByText('Enter — создать')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    resizeTo(700)
    fireEvent.click(screen.getByRole('button', { name: 'Новая задача' }))
    expect(await screen.findByText('Ctrl + Enter — создать')).toBeTruthy()
  })

  it('shows two columns with a hint in a wide panel and no "Назад"', async () => {
    resizeTo(700)
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    expect(await screen.findByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'КП' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
  })

  it('asks to pick a task in a wide panel until one is selected', async () => {
    resizeTo(700)
    renderApp()
    await screen.findByRole('button', { name: 'Отчёт' })
    expect(screen.getByText('Выберите задачу')).toBeTruthy()
  })

  it('keeps the selected task when the panel narrows', async () => {
    resizeTo(700)
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    resizeTo(400)
    expect(screen.getByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy()
  })

  it('opens the details of a requested task, and "Задача не найдена" for a deleted one', async () => {
    const { rerender } = renderApp({ requestedTaskId: 'b' })
    expect(await screen.findByRole('heading', { name: 'КП' })).toBeTruthy()
    vi.mocked(getTask).mockRejectedValue(new TaskNotFoundError('нет'))
    rerender(
      <LayoutModeProvider>
        <TasksApp requestedTaskId="gone" />
      </LayoutModeProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Задача не найдена' })).toBeTruthy()
  })
})

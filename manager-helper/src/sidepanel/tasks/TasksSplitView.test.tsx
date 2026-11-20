import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LayoutModeProvider } from '@synergy/ui-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import {
  TaskNotFoundError,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  searchUsers,
  updateTask,
} from '@/shared/tasks-api'
import { makeDetails, makeTask } from './fixtures'
import { TasksSplitView } from './TasksSplitView'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
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

function Screen(props: { requestedTaskId?: string | null }) {
  return (
    <LayoutModeProvider>
      <TasksSplitView userId="u1" login="anna" trailing={<div>уведомления</div>} {...props} />
    </LayoutModeProvider>
  )
}
const setup = () => render(<Screen />)

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 })
  for (const mock of [listTasks, getTask, updateTask, createTask, deleteTask, searchUsers]) {
    vi.mocked(mock).mockReset()
  }
  vi.mocked(searchUsers).mockResolvedValue({ items: [], total: 0, limit: 20, page: 0 })
  vi.mocked(listTasks).mockImplementation((params) =>
    Promise.resolve({
      items: params.overdue === true ? [A] : [A, B],
      total: params.overdue === true ? 3 : 2,
      limit: 50,
      page: 0,
    }),
  )
  vi.mocked(getTask).mockImplementation((id) =>
    Promise.resolve(makeDetails(id, { title: id === 'a' ? 'Отчёт' : 'КП' })),
  )
  vi.mocked(updateTask).mockImplementation((id, patch) =>
    Promise.resolve({ ...makeTask(id, { title: id === 'a' ? 'Отчёт' : 'КП' }), ...patch }),
  )
})

describe('tablet (>= 640)', () => {
  it('opens "Мои" and sends the request of the assigned tasks by deadline', async () => {
    setup()
    expect(await screen.findByRole('button', { name: 'Отчёт' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Мои' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: 'u1', sort: 'deadline', order: 'asc', page: 0 }),
    )
    expect(screen.getByText('уведомления')).toBeTruthy()
  })

  it('shows "Все", "Мои" and "Ещё" with the rest of the views in the menu', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    expect(screen.getByRole('button', { name: 'Все' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Просрочено/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ещё' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Я наблюдаю',
      'Созданные мной',
      'Просрочено3',
    ])
    await user.click(within(menu).getByRole('menuitem', { name: 'Я наблюдаю' }))
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ watcherId: 'u1' }))
    })
    expect(screen.getByRole('button', { name: 'Ещё' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('has no "Готовые" view: "Готово" is a status filter', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    expect(screen.queryByText('Готовые')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Статус/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Готово' }))
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'done', assigneeId: 'u1' }),
      )
    })
  })

  it('searches by title after typing stops', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по названию' }), {
      target: { value: 'отчёт' },
    })
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ search: 'отчёт' }))
    })
  })

  it('shows the list and the hint "Выберите задачу" side by side', async () => {
    setup()
    const row = await screen.findByRole('button', { name: 'Отчёт' })
    expect(row.closest('[hidden]')).toBeNull()
    expect(screen.getByText('Выберите задачу').closest('[hidden]')).toBeNull()
  })

  it('shows the details next to the list without "Назад"', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    expect(await screen.findByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'КП' }).closest('[hidden]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
    expect(screen.queryByText('Выберите задачу')).toBeNull()
  })

  it('does not reload the list when the width crosses the threshold', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    const calls = vi.mocked(listTasks).mock.calls.length
    resizeTo(400)
    resizeTo(800)
    expect(vi.mocked(listTasks).mock.calls.length).toBe(calls)
  })
})

describe('tablet: groups, close, search, delete', () => {
  const DAY = 86_400_000
  const overdue = makeTask('o', { title: 'Просроченная', deadline: new Date(Date.now() - 3 * DAY).toISOString() })
  const soon = makeTask('s', { title: 'Скоро', deadline: new Date(Date.now() + 1.5 * DAY).toISOString() })
  const none = makeTask('n', { title: 'Без даты' })

  it('groups the list by deadline when sorted by deadline', async () => {
    vi.mocked(listTasks).mockResolvedValue({ items: [overdue, soon, none], total: 3, limit: 50, page: 0 })
    setup()
    await screen.findByRole('button', { name: 'Просроченная' })
    const labels = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(labels).toContain('Просрочено')
    expect(labels).toContain('Без срока')
    expect(within(screen.getByRole('region', { name: 'Без срока' })).getByText('Без даты')).toBeTruthy()
  })

  it('shows no group captions for another sort', async () => {
    const user = userEvent.setup()
    vi.mocked(listTasks).mockResolvedValue({ items: [overdue, none], total: 2, limit: 50, page: 0 })
    setup()
    await screen.findByRole('button', { name: 'Просроченная' })
    await user.click(screen.getByRole('button', { name: /^Сортировка/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Сначала обновлённые' }))
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ sort: 'updatedAt' }))
    })
    await screen.findByRole('button', { name: 'Просроченная' })
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('"Закрыть" in the details clears the selection and brings back the hint', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(await screen.findByText('Выберите задачу')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Отчёт' })).toBeNull()
  })

  it('shows "Ничего не найдено" for an empty search and resets it', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    vi.mocked(listTasks).mockResolvedValue({ items: [], total: 0, limit: 50, page: 0 })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по названию' }), {
      target: { value: 'ничего' },
    })
    expect(await screen.findByText('Ничего не найдено')).toBeTruthy()
    vi.mocked(listTasks).mockResolvedValue({ items: [A], total: 1, limit: 50, page: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(await screen.findByRole('button', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Поиск по названию' })).toHaveProperty('value', '')
  })

  it('shows a toast with the title after the task is deleted', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteTask).mockResolvedValue(undefined)
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    await user.click(screen.getByRole('button', { name: 'Удалить задачу' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText('Задача «Отчёт» удалена и убрана из списка')).toBeTruthy()
  })

  it('keeps the task when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    await user.click(screen.getByRole('button', { name: 'Удалить задачу' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отмена' }))
    expect(deleteTask).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Отчёт' })).toBeTruthy()
  })
})

describe('details', () => {
  it('saves a changed status and keeps the screen', async () => {
    const user = userEvent.setup()
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    await user.click(screen.getByRole('button', { name: /^Статус: К выполнению/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'В работе' }))
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith('a', { status: 'in_progress' })
    })
    expect(screen.getByRole('heading', { name: 'Отчёт' })).toBeTruthy()
  })

  it('deletes the task after the confirmation and returns to the hint', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteTask).mockResolvedValue(undefined)
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    await user.click(screen.getByRole('button', { name: 'Удалить задачу' }))
    const dialog = await screen.findByRole('dialog')
    expect(deleteTask).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => {
      expect(deleteTask).toHaveBeenCalledWith('a')
    })
    expect(await screen.findByText('Выберите задачу')).toBeTruthy()
  })

  it('shows the attachments of the task with a download button', async () => {
    vi.mocked(getTask).mockResolvedValue(
      makeDetails('a', {
        title: 'Отчёт',
        attachments: [
          {
            id: 'f1',
            taskId: 'a',
            originalName: 'КП.pdf',
            sizeBytes: 2048,
            contentType: 'application/pdf',
            uploadedBy: 'u1',
            createdAt: '2026-11-01T00:00:00.000Z',
          },
        ],
      }),
    )
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    expect(await screen.findByText('КП.pdf')).toBeTruthy()
  })
})

describe('mobile (< 640)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 })
  })

  it('shows "Все", "Мои", "Просрочено" with the counter and "Ещё"', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    expect(screen.getByRole('button', { name: 'Все' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Мои' })).toBeTruthy()
    expect((await screen.findByRole('button', { name: /Просрочено/ })).textContent).toBe('Просрочено3')
    expect(screen.getByRole('button', { name: 'Ещё' })).toBeTruthy()
  })

  it('opens the details as a separate screen and "Назад" keeps the view and the search', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Поиск' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по названию' }), {
      target: { value: 'от' },
    })
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ search: 'от' }))
    })
    fireEvent.click(await screen.findByRole('button', { name: 'КП' }))
    await screen.findByRole('heading', { name: 'КП' })
    expect(screen.getByRole('button', { name: 'Отчёт', hidden: true }).closest('[hidden]')).not.toBeNull()
    vi.mocked(listTasks).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('searchbox', { name: 'Поиск по названию' })).toHaveProperty('value', 'от')
    expect(screen.getByRole('button', { name: 'Мои' }).getAttribute('aria-pressed')).toBe('true')
    expect(listTasks).not.toHaveBeenCalled()
  })

  it('keeps the selected task when the panel is widened', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    resizeTo(800)
    expect(screen.getByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
  })
})

describe('mobile: search bar, quick create, delete sheet', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 })
  })

  it('has no inline search field: the search opens in a bar over the header', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    expect(screen.queryByRole('searchbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Поиск' }))
    const field = screen.getByRole('searchbox', { name: 'Поиск по названию' })
    expect(document.activeElement).toBe(field)
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy()
  })

  it('"Очистить" empties the field and keeps the bar, "Назад" closes it and clears the query', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Поиск' }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'счёт' } })
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ search: 'счёт' }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Очистить' }))
    expect(screen.getByRole('searchbox')).toHaveProperty('value', '')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'акт' } })
    vi.mocked(listTasks).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Поиск' })).toBeTruthy()
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(expect.not.objectContaining({ search: 'акт' }))
    })
  })

  it('opens the quick create sheet instead of the dialog', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Новая задача' }))
    const sheet = await screen.findByRole('dialog', { name: 'Новая задача' })
    expect(within(sheet).getByText('Enter — создать')).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'Я · anna' })).toBeTruthy()
  })

  it('deletes through the confirmation sheet from the top bar of the details', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteTask).mockResolvedValue(undefined)
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    await user.click(screen.getByRole('button', { name: 'Удалить задачу' }))
    const sheet = await screen.findByRole('dialog', { name: 'Удалить задачу?' })
    expect(deleteTask).not.toHaveBeenCalled()
    await user.click(within(sheet).getByRole('button', { name: 'Удалить задачу' }))
    await waitFor(() => {
      expect(deleteTask).toHaveBeenCalledWith('a')
    })
    expect(await screen.findByText('Задача «Отчёт» удалена и убрана из списка')).toBeTruthy()
  })
})

describe('create sheet', () => {
  it('opens a Sheet with the form, the title focused, and closes it with Esc returning focus to "+"', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    const plus = screen.getByRole('button', { name: 'Новая задача' })
    fireEvent.click(plus)
    const dialog = await screen.findByRole('dialog', { name: 'Новая задача' })
    const title = within(dialog).getByLabelText(/Название/)
    await waitFor(() => {
      expect(document.activeElement).toBe(title)
    })
    expect(within(dialog).getByRole('button', { name: 'Ответственный' })).toBeTruthy()
    fireEvent.keyDown(title, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(plus)
    })
  })

  it('creates a task with the title, the current user as assignee, and reloads the list', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask('new'))
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Новая задача' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Название/), {
      target: { value: 'Позвонить клиенту' },
    })
    vi.mocked(listTasks).mockClear()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать задачу' }))
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: 'Позвонить клиенту', assigneeId: 'u1' })
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(listTasks).toHaveBeenCalled()
  })

  it('does not submit an empty title and shows a server error keeping the input', async () => {
    vi.mocked(createTask).mockRejectedValue(new Error('Сервер недоступен'))
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Новая задача' }))
    const dialog = await screen.findByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Создать задачу' })
    expect(submit).toHaveProperty('disabled', true)
    const title = within(dialog).getByLabelText(/Название/)
    fireEvent.change(title, { target: { value: 'КП' } })
    fireEvent.click(submit)
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(within(dialog).getByText(/Сервер недоступен/)).toBeTruthy()
    expect(title).toHaveProperty('value', 'КП')
  })
})

describe('requested task', () => {
  it('opens the details of the requested task and reports it handled', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 380 })
    const onTaskRequestHandled = vi.fn()
    render(
      <LayoutModeProvider>
        <TasksSplitView
          userId="u1"
          login="anna"
          requestedTaskId="b"
          onTaskRequestHandled={onTaskRequestHandled}
        />
      </LayoutModeProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'КП' })).toBeTruthy()
    expect(getTask).toHaveBeenCalledWith('b')
    expect(onTaskRequestHandled).toHaveBeenCalledTimes(1)
  })

  it('switches to a task requested later', async () => {
    const { rerender } = render(<Screen requestedTaskId={null} />)
    await screen.findByRole('button', { name: 'Отчёт' })
    expect(screen.getByText('Выберите задачу')).toBeTruthy()
    rerender(<Screen requestedTaskId="a" />)
    expect(await screen.findByRole('heading', { name: 'Отчёт' })).toBeTruthy()
  })

  it('shows "Задача не найдена" for a deleted task and returns to the list', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 380 })
    vi.mocked(getTask).mockRejectedValue(new TaskNotFoundError('нет'))
    render(<Screen requestedTaskId="gone" />)
    expect(await screen.findByRole('heading', { name: 'Задача не найдена' })).toBeTruthy()
    expect(screen.getByText(/Уведомление отмечено прочитанным/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'К списку задач' }))
    expect(await screen.findByRole('button', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Задача не найдена' })).toBeNull()
  })

  it('removes the task and shows a message when the open task is gone (404)', async () => {
    vi.mocked(getTask).mockRejectedValue(new TaskNotFoundError('нет'))
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    expect(await screen.findByText('Задача не найдена: возможно, её удалили')).toBeTruthy()
  })
})

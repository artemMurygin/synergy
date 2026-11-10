import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { getTask, listTasks, searchUsers, updateTask } from '@/shared/tasks-api'
import { makeDetails, makeTask } from './fixtures'
import { TasksSplitView } from './TasksSplitView'

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

function setup() {
  return render(<TasksSplitView userId="u1" login="anna" switcher={<div>переключатель</div>} />)
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 })
  vi.mocked(listTasks).mockReset()
  vi.mocked(getTask).mockReset()
  vi.mocked(updateTask).mockReset()
  vi.mocked(searchUsers).mockReset()
  vi.mocked(searchUsers).mockResolvedValue({ items: [], total: 0, limit: 20, page: 0 })
  vi.mocked(listTasks).mockImplementation((params) =>
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
  vi.mocked(updateTask).mockImplementation((id, patch) =>
    Promise.resolve(makeDetails(id, { title: id === 'a' ? 'Отчёт' : 'КП', ...patch })),
  )
})

describe('TasksSplitView wide panel (>= 640)', () => {
  it('shows the list and the hint side by side when nothing is selected', async () => {
    setup()
    const row = await screen.findByRole('button', { name: 'Отчёт' })
    expect(row.closest('[hidden]')).toBeNull()
    const hint = screen.getByText('Выберите задачу')
    expect(hint.closest('[hidden]')).toBeNull()
    expect(screen.getByText('переключатель')).toBeTruthy()
  })

  it('selects a task and shows its details next to the list without "Назад"', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    expect(await screen.findByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'КП' }).closest('[hidden]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
    expect(screen.queryByText('Выберите задачу')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'КП' }))
    expect(await screen.findByRole('heading', { name: 'КП' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Отчёт' })).toBeNull()
  })

  it('changes the status from the details without leaving the screen', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('radio', { name: 'В работе' }))
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith('a', { status: 'in_progress' })
    })
    expect(screen.getByRole('heading', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'КП' }).closest('[hidden]')).toBeNull()
  })

  it('changes the status from the list row and refreshes the open details', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    vi.mocked(getTask).mockImplementation((id) =>
      Promise.resolve(makeDetails(id, { title: 'Отчёт', status: 'in_progress' })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Отметить выполненной: КП' }))
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith('b', { status: 'done' })
    })
    expect(screen.getByRole('heading', { name: 'Отчёт' })).toBeTruthy()
  })

  it('edits the title in the right column without changing the screen', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Отчёт' }))
    await screen.findByRole('heading', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новое' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith('a', { title: 'Новое' })
    })
    expect(screen.getByRole('button', { name: 'КП' }).closest('[hidden]')).toBeNull()
  })

  it('opens the quick create form in the list column', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('button', { name: 'Новая задача' }))
    expect(screen.getByRole('textbox', { name: 'Название задачи' })).toBeTruthy()
    expect(screen.getByText('Выберите задачу')).toBeTruthy()
  })
})

describe('TasksSplitView narrowing (< 640)', () => {
  it('opens the details of the selected task and keeps the same list element on return', async () => {
    setup()
    const row = await screen.findByRole('button', { name: 'Отчёт' })
    const list = row.closest('ul')
    fireEvent.click(row)
    await screen.findByRole('heading', { name: 'Отчёт' })
    resizeTo(400)
    expect(screen.getByRole('heading', { name: 'Отчёт' }).closest('[hidden]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Отчёт', hidden: true }).closest('[hidden]'),
    ).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    const back = screen.getByRole('button', { name: 'Отчёт' })
    expect(back.closest('ul')).toBe(list)
    expect(back.closest('[hidden]')).toBeNull()
  })

  it('shows only the list when nothing is selected', async () => {
    resizeTo(400)
    setup()
    expect((await screen.findByRole('button', { name: 'Отчёт' })).closest('[hidden]')).toBeNull()
    expect(screen.queryByText('Выберите задачу')?.closest('[hidden]') ?? null).not.toBeNull()
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

describe('TasksSplitView views and search', () => {
  it('switches the view and requests that view', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('tab', { name: 'Наблюдаю' }))
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ watcherId: 'u1' }))
    })
    expect(screen.getByRole('tab', { name: 'Наблюдаю' }).getAttribute('aria-selected')).toBe('true')
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

  it('keeps the view and the search after "Назад" in a narrow panel', async () => {
    resizeTo(400)
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('tab', { name: 'Созданные мной' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по названию' }), {
      target: { value: 'от' },
    })
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ creatorId: 'u1', search: 'от' }),
      )
    })
    // The mock serves "КП" to every view without a status.
    fireEvent.click(await screen.findByRole('button', { name: 'КП' }))
    await screen.findByRole('heading', { name: 'КП' })
    vi.mocked(listTasks).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('tab', { name: 'Созданные мной' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByRole('searchbox', { name: 'Поиск по названию' })).toHaveProperty(
      'value',
      'от',
    )
    expect(listTasks).not.toHaveBeenCalled()
  })

  it('keeps the view and the search when the panel is narrowed', async () => {
    setup()
    await screen.findByRole('button', { name: 'Отчёт' })
    fireEvent.click(screen.getByRole('tab', { name: 'Готовые' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по названию' }), {
      target: { value: 'кп' },
    })
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'done', search: 'кп' }),
      )
    })
    vi.mocked(listTasks).mockClear()
    resizeTo(400)
    expect(screen.getByRole('tab', { name: 'Готовые' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('searchbox', { name: 'Поиск по названию' })).toHaveProperty(
      'value',
      'кп',
    )
    expect(listTasks).not.toHaveBeenCalled()
  })
})

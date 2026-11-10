import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { TaskToolbar } from './TaskToolbar'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  useTasksStore.setState(INITIAL_TASKS_STATE)
})

describe('TaskToolbar', () => {
  it('offers the five quick views and marks the current one', () => {
    render(<TaskToolbar />)
    for (const name of ['Все', 'Мои', 'Я наблюдаю', 'Созданные мной', 'Просроченные']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Мои' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('switches the view and returns to the first page', async () => {
    useTasksStore.setState({ page: 3 })
    render(<TaskToolbar />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Мои' }))
    expect(useTasksStore.getState().view).toBe('mine')
    expect(useTasksStore.getState().page).toBe(1)
    expect(screen.getByRole('button', { name: 'Мои' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('filters by status and can clear the filter', async () => {
    render(<TaskToolbar />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Статус'), 'in_progress')
    expect(useTasksStore.getState().status).toBe('in_progress')
    await user.selectOptions(screen.getByLabelText('Статус'), '')
    expect(useTasksStore.getState().status).toBeNull()
  })

  it('sorts by deadline ascending', async () => {
    render(<TaskToolbar />)
    await userEvent.setup().selectOptions(screen.getByLabelText('Сортировка'), 'deadline:asc')
    expect(useTasksStore.getState().sort).toBe('deadline')
    expect(useTasksStore.getState().order).toBe('asc')
  })

  it('defaults to newest created first', () => {
    render(<TaskToolbar />)
    expect((screen.getByLabelText('Сортировка') as HTMLSelectElement).value).toBe('createdAt:desc')
  })

  it('sends the search to the store only after a pause in typing', () => {
    vi.useFakeTimers()
    render(<TaskToolbar />)
    const input = screen.getByLabelText('Поиск по названию')
    fireEvent.change(input, { target: { value: 'к' } })
    fireEvent.change(input, { target: { value: 'кп' } })
    expect(useTasksStore.getState().search).toBe('')
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(useTasksStore.getState().search).toBe('кп')
  })

  it('shows the typed text immediately', () => {
    render(<TaskToolbar />)
    const input = screen.getByLabelText('Поиск по названию') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'отчёт' } })
    expect(input.value).toBe('отчёт')
  })

  it('clears the input when the filters are reset elsewhere', () => {
    vi.useFakeTimers()
    render(<TaskToolbar />)
    const input = screen.getByLabelText('Поиск по названию') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'отчёт' } })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    act(() => useTasksStore.getState().resetFilters())
    expect(input.value).toBe('')
  })
})

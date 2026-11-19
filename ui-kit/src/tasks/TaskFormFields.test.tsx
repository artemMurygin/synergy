import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_TASK_FORM, TaskFormFields, type TaskFormValue } from './TaskFormFields'

const search = { users: [{ id: 'u1', login: 'maria' }], onSearch: vi.fn() }

function setup(value: TaskFormValue = EMPTY_TASK_FORM, errors = {}) {
  const onChange = vi.fn()
  render(<TaskFormFields value={value} onChange={onChange} errors={errors} userSearch={search} me={{ id: 'u1', login: 'maria' }} />)
  return onChange
}

describe('TaskFormFields', () => {
  it('поля с подписями', () => {
    setup()
    expect(screen.getByLabelText(/Название/)).toBeTruthy()
    expect(screen.getByLabelText(/Описание/)).toBeTruthy()
    expect(screen.getByLabelText(/Дедлайн/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ответственный' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Наблюдатели' })).toBeTruthy()
  })

  it('ввод названия отдаёт новое значение', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'КП' } })
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_TASK_FORM, title: 'КП' })
  })

  it('дедлайн сохраняется как ISO', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(/Дедлайн/), { target: { value: '2026-12-12T18:00' } })
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_TASK_FORM,
      deadline: new Date('2026-12-12T18:00').toISOString(),
    })
  })

  it('ошибки полей показываются текстом', () => {
    setup(EMPTY_TASK_FORM, { title: 'Укажите название' })
    expect(screen.getByText('Укажите название')).toBeTruthy()
    expect(screen.getByLabelText(/Название/).getAttribute('aria-invalid')).toBe('true')
  })

  it('«Я» ставит ответственным текущего пользователя', async () => {
    const onChange = setup()
    const [first] = screen.getAllByRole('button', { name: 'Я' })
    if (!first) throw new Error('нет кнопки «Я»')
    await userEvent.click(first)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ assignee: { id: 'u1', login: 'maria' } }))
  })
})

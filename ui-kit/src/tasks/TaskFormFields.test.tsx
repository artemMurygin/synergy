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
    expect(screen.getByRole('button', { name: 'Дедлайн' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ответственный' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Наблюдатели' })).toBeTruthy()
  })

  it('ввод названия отдаёт новое значение', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'КП' } })
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_TASK_FORM, title: 'КП' })
  })

  it('дедлайн выбирается через DeadlinePicker и сохраняется как ISO', async () => {
    const onChange = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Дедлайн' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Завтра' }))
    await userEvent.click(screen.getByRole('button', { name: /^Готово ·/ }))
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(18, 0, 0, 0)
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_TASK_FORM, deadline: tomorrow.toISOString() })
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

  it('Ctrl+Enter отправляет форму, если отправка доступна', () => {
    const onSubmit = vi.fn()
    render(<TaskFormFields value={EMPTY_TASK_FORM} onChange={vi.fn()} userSearch={search} onSubmit={onSubmit} canSubmit />)
    fireEvent.keyDown(screen.getByLabelText(/Название/), { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(screen.getByLabelText(/Описание/), { key: 'Enter', metaKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Ctrl + Enter — создать')).toBeTruthy()
  })

  it('Ctrl+Enter ничего не делает, если отправка недоступна', () => {
    const onSubmit = vi.fn()
    render(<TaskFormFields value={EMPTY_TASK_FORM} onChange={vi.fn()} userSearch={search} onSubmit={onSubmit} canSubmit={false} />)
    fireEvent.keyDown(screen.getByLabelText(/Название/), { key: 'Enter', ctrlKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Enter в описании не отправляет форму', () => {
    const onSubmit = vi.fn()
    render(<TaskFormFields value={EMPTY_TASK_FORM} onChange={vi.fn()} userSearch={search} onSubmit={onSubmit} canSubmit />)
    const notPrevented = fireEvent.keyDown(screen.getByLabelText(/Описание/), { key: 'Enter' })
    expect(notPrevented).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

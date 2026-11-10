import './test-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session.store'
import { listUsers } from '@/lib/backend/users.api'
import { TaskForm, type TaskFormProps } from './TaskForm'

vi.mock('@/lib/backend/users.api')

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
  useSessionStore.setState({ snapshot: { state: 'authenticated', user: { id: 'u1', login: 'anna' } } })
  vi.mocked(listUsers).mockResolvedValue({
    items: [
      { id: 'u1', login: 'anna' },
      { id: 'u2', login: 'maria' }
    ],
    total: 2,
    limit: 20,
    page: 1
  })
})

function setup(props: Partial<TaskFormProps> = {}) {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TaskForm onSubmit={onSubmit} onCancel={onCancel} submitting={false} fieldErrors={{}} {...props} />
    </QueryClientProvider>
  )
  return { onSubmit, onCancel, user: userEvent.setup() }
}

const submit = () => screen.getByRole('button', { name: 'Создать задачу' })
const titleField = () => screen.getByRole('textbox', { name: /Название/ })

describe('TaskForm', () => {
  it('blocks submit while the title is empty or only spaces', async () => {
    const { user, onSubmit } = setup()
    expect(submit()).toHaveProperty('disabled', true)
    await user.type(titleField(), '   ')
    expect(submit()).toHaveProperty('disabled', true)
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    await user.type(titleField(), 'КП')
    expect(submit()).toHaveProperty('disabled', false)
  })

  it('blocks submit and reports the busy state while the request runs', async () => {
    const { user } = setup({ submitting: true })
    await user.type(titleField(), 'КП')
    expect(submit()).toHaveProperty('disabled', true)
    expect(submit().getAttribute('aria-busy')).toBe('true')
  })

  it('sends a trimmed title and leaves empty optional fields out', async () => {
    const { user, onSubmit } = setup()
    await user.type(titleField(), '  Подготовить КП  ')
    await user.click(submit())
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ title: 'Подготовить КП' })
  })

  it('sends description, deadline, assignee and watchers when they are filled', async () => {
    const { user, onSubmit } = setup()
    await user.type(titleField(), 'КП')
    await user.type(screen.getByRole('textbox', { name: 'Описание' }), 'Собрать условия')
    fireEvent.change(screen.getByLabelText('Дедлайн'), { target: { value: '2026-12-12T18:00' } })
    await user.click(screen.getByRole('button', { name: /Ответственный/ }))
    await user.click(await screen.findByRole('option', { name: /maria/ }))
    await user.click(screen.getByRole('button', { name: /Наблюдатели/ }))
    await user.click(await screen.findByRole('option', { name: /anna/ }))
    await user.keyboard('{Escape}')
    await user.click(submit())

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      title: 'КП',
      description: 'Собрать условия',
      deadline: new Date('2026-12-12T18:00').toISOString(),
      assigneeId: 'u2',
      watcherIds: ['u1']
    })
  })

  it('assigns the current user with "Назначить на себя"', async () => {
    const { user, onSubmit } = setup()
    await user.type(titleField(), 'КП')
    await user.click(screen.getByRole('button', { name: 'Назначить на себя' }))
    expect(screen.getByRole('button', { name: /Ответственный/ }).textContent).toContain('anna')
    await user.click(submit())
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ title: 'КП', assigneeId: 'u1' })
  })

  it('shows server errors next to their fields', () => {
    setup({
      fieldErrors: {
        title: 'Название слишком длинное',
        description: 'Описание слишком длинное',
        deadline: 'Неверная дата',
        assignee: 'Пользователь не найден или отключён',
        watchers: 'Наблюдатель не найден'
      }
    })
    const cases: [HTMLElement, string][] = [
      [titleField(), 'Название слишком длинное'],
      [screen.getByRole('textbox', { name: 'Описание' }), 'Описание слишком длинное'],
      [screen.getByLabelText('Дедлайн'), 'Неверная дата'],
      [screen.getByRole('button', { name: /Ответственный/ }), 'Пользователь не найден или отключён'],
      [screen.getByRole('button', { name: /Наблюдатели/ }), 'Наблюдатель не найден']
    ]
    for (const [field, text] of cases) {
      expect(field.getAttribute('aria-invalid')).toBe('true')
      const message = screen.getByText(text)
      expect(field.getAttribute('aria-describedby')).toContain(message.id)
    }
  })

  it('starts from the initial values', () => {
    setup({ initial: { title: 'Старое', description: 'Текст' } })
    expect(titleField()).toHaveProperty('value', 'Старое')
    expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveProperty('value', 'Текст')
  })

  it('cancels', async () => {
    const { user, onCancel } = setup()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('rejects an over-long title at the field without submitting', async () => {
    const { user, onSubmit } = setup()
    fireEvent.change(titleField(), { target: { value: 'я'.repeat(201) } })
    await user.click(submit())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(titleField().getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Название не длиннее 200 символов')).toBeTruthy()
  })

  it('rejects an over-long description at the field without submitting', async () => {
    const { user, onSubmit } = setup()
    await user.type(titleField(), 'КП')
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), { target: { value: 'я'.repeat(10001) } })
    await user.click(submit())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Описание не длиннее 10000 символов')).toBeTruthy()
  })
})

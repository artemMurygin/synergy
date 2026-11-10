import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { BackendError, createTask, searchUsers } from '@/shared/tasks-api'
import { makeDetails } from './fixtures'
import { QuickCreate } from './QuickCreate'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  createTask: vi.fn(),
  searchUsers: vi.fn(),
}))

const ME = { id: 'u1', login: 'anna' }

beforeEach(() => {
  vi.mocked(createTask).mockReset()
  vi.mocked(searchUsers).mockReset()
  vi.mocked(createTask).mockResolvedValue(makeDetails('new'))
  vi.mocked(searchUsers).mockResolvedValue({
    items: [{ id: 'u2', login: 'ivan' }],
    total: 1,
    limit: 20,
    page: 0,
  })
})

function setup() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  render(<QuickCreate me={ME} onCreated={onCreated} onCancel={onCancel} />)
  return {
    onCreated,
    onCancel,
    input: screen.getByRole<HTMLInputElement>('textbox', { name: 'Название задачи' }),
  }
}

describe('QuickCreate', () => {
  it('creates a task with the title only and the current user as assignee on Enter', async () => {
    const { input, onCreated } = setup()
    fireEvent.change(input, { target: { value: 'Позвонить клиенту' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    expect(createTask).toHaveBeenCalledWith({ title: 'Позвонить клиенту', assigneeId: 'u1' })
    expect(input.value).toBe('')
  })

  it('blocks submission with an empty or blank title', () => {
    const { input } = setup()
    expect(screen.getByRole('button', { name: 'Создать' }).hasAttribute('disabled')).toBe(true)
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Создать' }).hasAttribute('disabled')).toBe(true)
    expect(createTask).not.toHaveBeenCalled()
  })

  it('does not submit twice while the request is running', async () => {
    let finish: (value: ReturnType<typeof makeDetails>) => void = () => undefined
    vi.mocked(createTask).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'Задача' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Создать' }).hasAttribute('disabled')).toBe(true)
    expect(createTask).toHaveBeenCalledTimes(1)
    finish(makeDetails('new'))
    await waitFor(() => {
      expect(input.value).toBe('')
    })
  })

  it('keeps the typed text and shows the error when the server refuses', async () => {
    vi.mocked(createTask).mockRejectedValue(new BackendError('Сервер отклонил запрос'))
    const { input, onCreated } = setup()
    fireEvent.change(input, { target: { value: 'Позвонить' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Сервер отклонил запрос/)
    expect(input.value).toBe('Позвонить')
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Создать' }).hasAttribute('disabled')).toBe(false)
  })

  it('reveals the deadline field and sends it', async () => {
    const { input } = setup()
    expect(screen.queryByLabelText('Дедлайн')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Дедлайн/ }))
    fireEvent.change(screen.getByLabelText('Дедлайн'), { target: { value: '2099-12-12T10:00' } })
    fireEvent.change(input, { target: { value: 'Отчёт' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
    expect(createTask).toHaveBeenCalledWith({
      title: 'Отчёт',
      assigneeId: 'u1',
      deadline: new Date('2099-12-12T10:00').toISOString(),
    })
  })

  it('reveals the assignee search and sends the chosen user', async () => {
    const { input } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Я · anna/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Ответственный' }), {
      target: { value: 'iv' },
    })
    fireEvent.click(await screen.findByRole('option', { name: 'ivan' }))
    fireEvent.change(input, { target: { value: 'Передать' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
    expect(createTask).toHaveBeenCalledWith({ title: 'Передать', assigneeId: 'u2' })
  })

  it('reveals the description under "Ещё"', async () => {
    const { input } = setup()
    expect(screen.queryByLabelText('Описание')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ещё' }))
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Подробности' } })
    fireEvent.change(input, { target: { value: 'Задача' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
    expect(createTask).toHaveBeenCalledWith({
      title: 'Задача',
      assigneeId: 'u1',
      description: 'Подробности',
    })
  })

  it('cancels without creating', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(createTask).not.toHaveBeenCalled()
  })
})

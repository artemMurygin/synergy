import { LayoutModeProvider } from '@synergy/ui-kit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { TaskUserNotFoundError, createTask, searchUsers } from '@/shared/tasks-api'
import { makeTask } from './fixtures'
import { TaskCreateDialog } from './TaskCreateDialog'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  createTask: vi.fn(),
  searchUsers: vi.fn(),
}))

const ME = { id: 'u1', login: 'anna' }

function setup() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  render(
    <LayoutModeProvider mode="tablet">
      <TaskCreateDialog me={ME} onCreated={onCreated} onCancel={onCancel} />
    </LayoutModeProvider>,
  )
  return { onCreated, onCancel }
}

beforeEach(() => {
  vi.mocked(createTask).mockReset()
  vi.mocked(searchUsers).mockReset()
  vi.mocked(searchUsers).mockResolvedValue({ items: [], total: 0, limit: 20, page: 0 })
})

describe('TaskCreateDialog', () => {
  it('opens a dialog with the full form and the Ctrl + Enter hint', async () => {
    setup()
    const dialog = await screen.findByRole('dialog', { name: 'Новая задача' })
    expect(within(dialog).getByLabelText(/Название/)).toBeTruthy()
    expect(within(dialog).getByLabelText(/Описание/)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Ответственный' })).toBeTruthy()
    expect(within(dialog).getByText('Ctrl + Enter — создать')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeTruthy()
  })

  it('creates the task with Ctrl + Enter and the current user as assignee', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask('new'))
    const { onCreated } = setup()
    const dialog = await screen.findByRole('dialog')
    const title = within(dialog).getByLabelText(/Название/)
    fireEvent.change(title, { target: { value: 'КП' } })
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: 'КП', assigneeId: 'u1' })
    })
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
  })

  it('blocks an empty title and keeps the input on a server error', async () => {
    vi.mocked(createTask).mockRejectedValue(new Error('Сервер недоступен'))
    setup()
    const dialog = await screen.findByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Создать задачу' })
    expect(submit).toHaveProperty('disabled', true)
    const title = within(dialog).getByLabelText(/Название/)
    fireEvent.change(title, { target: { value: 'КП' } })
    fireEvent.click(submit)
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(title).toHaveProperty('value', 'КП')
  })

  it('marks an unknown assignee', async () => {
    vi.mocked(createTask).mockRejectedValue(new TaskUserNotFoundError('нет'))
    setup()
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Название/), { target: { value: 'КП' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать задачу' }))
    expect(await within(dialog).findByText('Пользователь не найден или отключён')).toBeTruthy()
  })

  it('cancels with the button and with Escape', async () => {
    const { onCancel } = setup()
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    fireEvent.keyDown(within(dialog).getByLabelText(/Название/), { key: 'Escape' })
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(2)
    })
  })
})

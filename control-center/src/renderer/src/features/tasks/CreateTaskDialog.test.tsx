import './test-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session.store'
import { BackendError, TaskUserNotFoundError } from '@/lib/backend/errors'
import * as tasksApi from '@/lib/backend/tasks.api'
import { listUsers } from '@/lib/backend/users.api'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { CreateTaskDialog } from './CreateTaskDialog'
import { mkTask } from './test-utils'

vi.mock('@/lib/backend/tasks.api')
vi.mock('@/lib/backend/users.api')

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
  useTasksStore.setState(INITIAL_TASKS_STATE)
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

function Host({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Новая задача
      </button>
      <CreateTaskDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onOpenChange(next)
        }}
      />
    </>
  )
}

async function setup() {
  const onOpenChange = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <Host onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  const opener = screen.getByRole('button', { name: 'Новая задача' })
  await user.click(opener)
  const dialog = await screen.findByRole('dialog', { name: 'Новая задача' })
  return { user, onOpenChange, invalidate, opener, dialog }
}

async function fillTitle(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(within(dialog).getByRole('textbox', { name: /Название/ }), 'Подготовить КП')
}

describe('CreateTaskDialog', () => {
  it('creates the task, closes, refreshes the list and opens the task in the drawer', async () => {
    const { user, dialog, onOpenChange, invalidate } = await setup()
    vi.mocked(tasksApi.createTask).mockResolvedValue(mkTask('t9', { title: 'Подготовить КП' }))
    await fillTitle(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(tasksApi.createTask).toHaveBeenCalledExactlyOnceWith({ title: 'Подготовить КП' })
    expect(useTasksStore.getState().selectedTaskId).toBe('t9')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays open with the input and a field error when a participant is gone (422)', async () => {
    const { user, dialog, onOpenChange } = await setup()
    vi.mocked(tasksApi.createTask).mockRejectedValue(
      new TaskUserNotFoundError('Пользователь не найден или отключён')
    )
    await fillTitle(user, dialog)
    await user.type(within(dialog).getByRole('textbox', { name: 'Описание' }), 'Собрать условия')
    await user.click(within(dialog).getByRole('button', { name: /Ответственный/ }))
    await user.click(await screen.findByRole('option', { name: /maria/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }))

    const message = await within(dialog).findByText('Пользователь не найден или отключён')
    const assignee = within(dialog).getByRole('button', { name: /Ответственный/ })
    expect(assignee.getAttribute('aria-invalid')).toBe('true')
    expect(assignee.getAttribute('aria-describedby')).toContain(message.id)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(within(dialog).getByRole('textbox', { name: /Название/ })).toHaveProperty('value', 'Подготовить КП')
    expect(within(dialog).getByRole('textbox', { name: 'Описание' })).toHaveProperty('value', 'Собрать условия')
    expect(assignee.textContent).toContain('maria')
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Создать задачу' })).toHaveProperty('disabled', false)
  })

  it('keeps the input and shows the message on a network error', async () => {
    const { user, dialog } = await setup()
    vi.mocked(tasksApi.createTask).mockRejectedValue(
      new BackendError('Не удалось связаться с сервером. Он запущен?')
    )
    await fillTitle(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }))

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Не удалось связаться с сервером')
    expect(within(dialog).getByRole('textbox', { name: /Название/ })).toHaveProperty('value', 'Подготовить КП')
  })

  it('disables the form while the request is running', async () => {
    const { user, dialog } = await setup()
    vi.mocked(tasksApi.createTask).mockReturnValue(new Promise(() => {}))
    await fillTitle(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Создать задачу' })).toHaveProperty('disabled', true))
    await user.keyboard('{Enter}')
    expect(tasksApi.createTask).toHaveBeenCalledOnce()
  })

  it('returns focus to the button that opened it on Escape and on Cancel', async () => {
    const { user, opener } = await setup()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))

    await user.click(opener)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('starts empty each time it is opened', async () => {
    const { user, dialog, opener } = await setup()
    await fillTitle(user, dialog)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(opener)
    expect(within(await screen.findByRole('dialog')).getByRole('textbox', { name: /Название/ })).toHaveProperty('value', '')
  })

  it('shows a server validation error at the field it names', async () => {
    vi.mocked(tasksApi.createTask).mockRejectedValue(
      new BackendError('✖ Invalid input: expected string to match the deadline format\n  → at deadline')
    )
    const { user, dialog } = await setup()
    await fillTitle(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }))
    const error = await within(dialog).findByText(/expected string to match the deadline format/)
    expect(within(dialog).getByLabelText('Дедлайн').getAttribute('aria-describedby')).toBe(error.id)
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })
})

import './test-dom'
import { TaskRow } from '@synergy/ui-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session.store'
import { AttachmentTooLargeError, TaskNotFoundError } from '@/lib/backend/errors'
import * as tasksApi from '@/lib/backend/tasks.api'
import type { TaskDetails } from '@/lib/backend/tasks.schema'
import { listUsers } from '@/lib/backend/users.api'
import { useNotificationsStore } from '@/stores/notifications.store'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { TaskDetailsPanel } from './TaskDetailsPanel'
import { mkTask } from './test-utils'
import { Desktop } from './test-wrapper'

vi.mock('@/lib/backend/tasks.api')
vi.mock('@/lib/backend/users.api')

afterEach(() => {
  cleanup()
  useNotificationsStore.getState().reset()
})

const mkDetails = (extra: Partial<TaskDetails> = {}): TaskDetails => ({
  ...mkTask('t1', { title: 'Подготовить КП', description: 'Описание задачи' }),
  attachments: [],
  ...extra
})

beforeEach(() => {
  vi.resetAllMocks()
  useUiStore.setState({ section: 'tasks' })
  useTasksStore.setState({ ...INITIAL_TASKS_STATE, selectedTaskId: 't1' })
  useSessionStore.setState({ snapshot: { state: 'authenticated', user: { id: 'u1', login: 'admin' } } })
  vi.mocked(listUsers).mockResolvedValue({ items: [{ id: 'u3', login: 'maria' }], total: 1, limit: 20, page: 1 })
})

function setup(details: TaskDetails | Error = mkDetails()) {
  if (details instanceof Error) vi.mocked(tasksApi.getTask).mockRejectedValue(details)
  else vi.mocked(tasksApi.getTask).mockResolvedValue(details)
  vi.mocked(tasksApi.updateTask).mockResolvedValue(mkTask('t1'))
  vi.mocked(tasksApi.deleteTask).mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Desktop>
        <ul>
          <TaskRow
            task={mkTask('t1', { title: 'Подготовить КП' })}
            selected
            variant="wide"
            onOpen={useTasksStore.getState().selectTask}
          />
        </ul>
        <TaskDetailsPanel />
      </Desktop>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

// resolves once the details are loaded
async function panel(): Promise<HTMLElement> {
  const aside = await screen.findByRole('complementary', { name: 'Детали задачи' })
  await within(aside).findByRole('heading', { name: 'Подготовить КП' })
  return aside
}

describe('TaskDetailsPanel', () => {
  it('renders nothing when no task is selected', () => {
    useTasksStore.setState({ selectedTaskId: null })
    setup()
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('shows a loading state, then the fields of the package details', async () => {
    setup()
    expect(await screen.findByRole('status', { name: 'Загрузка задачи' })).toBeTruthy()
    const aside = await panel()
    expect(within(aside).getByText('Описание задачи')).toBeTruthy()
    expect(within(aside).getByRole('button', { name: 'Статус: К выполнению' })).toBeTruthy()
    expect(within(aside).getByText('anna')).toBeTruthy()
  })

  it('closes on Escape and returns focus to the row', async () => {
    const user = setup()
    await panel()
    await user.keyboard('{Escape}')
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[data-task-id="t1"]'))
  })

  it('keeps the task open when Escape is pressed in the chats section', async () => {
    const user = setup()
    await panel()
    useUiStore.setState({ section: 'chats' })
    await user.keyboard('{Escape}')
    expect(useTasksStore.getState().selectedTaskId).toBe('t1')
  })

  it('closes with the button', async () => {
    const user = setup()
    const aside = await panel()
    await user.click(within(aside).getByRole('button', { name: 'Закрыть панель' }))
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
  })

  it('reports a task deleted by someone else (404) and closes by the button', async () => {
    const user = setup(new TaskNotFoundError('gone'))
    expect((await screen.findByRole('alert')).textContent).toContain('Её удалил другой пользователь')
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
    await user.click(screen.getByRole('button', { name: 'К списку задач' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('says it is not found once when the task was opened from a notification', async () => {
    const user = setup(new TaskNotFoundError('gone'))
    act(() => {
      useNotificationsStore.getState().showNotice('Задача не найдена')
    })
    const alert = await screen.findByRole('alert')
    await waitFor(() => {
      expect(alert.textContent).toContain('Уведомление отмечено прочитанным')
    })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'К списку задач' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(useNotificationsStore.getState().notice).toBeNull()
  })

  it('changes the status from the panel', async () => {
    const user = setup()
    const aside = await panel()
    await user.click(within(aside).getByRole('button', { name: 'Статус: К выполнению' }))
    await user.click(await screen.findByRole('menuitem', { name: 'В работе' }))
    await waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { status: 'in_progress' })
    })
  })

  it('sends only the changed title', async () => {
    const user = setup()
    const aside = await panel()
    await user.click(within(aside).getByRole('button', { name: 'Изменить название' }))
    const field = within(aside).getByRole('textbox', { name: 'Название' })
    await user.clear(field)
    await user.type(field, 'Новое название{Enter}')
    await waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { title: 'Новое название' })
    })
  })

  it('sends the new description', async () => {
    const user = setup()
    const aside = await panel()
    await user.click(within(aside).getByRole('button', { name: 'Изменить описание' }))
    const field = within(aside).getByRole('textbox', { name: 'Описание' })
    await user.clear(field)
    await user.type(field, 'Новое описание')
    fireEvent.blur(field)
    await waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { description: 'Новое описание' })
    })
  })

  it('shows the message when saving fails', async () => {
    const user = setup()
    const aside = await panel()
    vi.mocked(tasksApi.updateTask).mockRejectedValue(new Error('boom'))
    await user.click(within(aside).getByRole('button', { name: 'Статус: К выполнению' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Готово' }))
    expect(await within(aside).findByText('Не удалось изменить статус. Он возвращён к прежнему.')).toBeTruthy()
  })

  it('deletes the task after confirmation and closes', async () => {
    const user = setup()
    const aside = await panel()
    await user.click(within(aside).getByRole('button', { name: 'Удалить задачу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить задачу?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => {
      expect(tasksApi.deleteTask).toHaveBeenCalledWith('t1')
    })
    await waitFor(() => {
      expect(useTasksStore.getState().selectedTaskId).toBeNull()
    })
    expect(await screen.findByText(/удалена и убрана из списка/)).toBeTruthy()
  })

  it('keeps the task when the deletion is cancelled', async () => {
    const user = setup()
    const aside = await panel()
    await user.click(within(aside).getByRole('button', { name: 'Удалить задачу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить задачу?' })
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(tasksApi.deleteTask).not.toHaveBeenCalled()
    expect(useTasksStore.getState().selectedTaskId).toBe('t1')
  })

  it('uploads an attachment and says that the file is too large in words', async () => {
    const user = setup()
    const aside = await panel()
    vi.mocked(tasksApi.uploadAttachment).mockRejectedValue(new AttachmentTooLargeError('413'))
    const file = new File(['x'], 'большой.pdf', { type: 'application/pdf' })
    await user.upload(within(aside).getByLabelText('Выбрать файлы'), file)
    expect(await within(aside).findByText('Файл слишком большой: максимум 20 МБ')).toBeTruthy()
    expect(tasksApi.uploadAttachment).toHaveBeenCalledWith('t1', file, expect.anything())
  })

  it('assigns the user picked from the search', async () => {
    const user = setup()
    const aside = await panel()
    await user.click(within(aside).getByRole('button', { name: /Ответственный/ }))
    await user.click(await screen.findByRole('option', { name: /maria/ }))
    await waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { assigneeId: 'u3' })
    })
  })
})

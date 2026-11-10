import './test-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session.store'
import { TaskNotFoundError } from '@/lib/backend/errors'
import * as tasksApi from '@/lib/backend/tasks.api'
import type { TaskDetails } from '@/lib/backend/tasks.schema'
import { listUsers } from '@/lib/backend/users.api'
import { INITIAL_TASKS_STATE, useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { TaskDrawer } from './TaskDrawer'
import { TaskRow } from './TaskRow'
import { mkTask, NOW } from './test-utils'

vi.mock('@/lib/backend/tasks.api')
vi.mock('@/lib/backend/users.api')

afterEach(cleanup)

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
  vi.mocked(listUsers).mockResolvedValue({
    items: [
      { id: 'u2', login: 'anna' },
      { id: 'u3', login: 'maria' }
    ],
    total: 2,
    limit: 20,
    page: 1
  })
})

function setup(details: TaskDetails | Error = mkDetails()) {
  if (details instanceof Error) vi.mocked(tasksApi.getTask).mockRejectedValue(details)
  else vi.mocked(tasksApi.getTask).mockResolvedValue(details)
  vi.mocked(tasksApi.updateTask).mockResolvedValue(mkTask('t1'))
  vi.mocked(tasksApi.deleteTask).mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ul>
        <TaskRow
          task={mkTask('t1', { title: 'Подготовить КП' })}
          selected
          now={NOW}
          onSelect={useTasksStore.getState().selectTask}
          onStatusChange={vi.fn()}
        />
      </ul>
      <TaskDrawer />
    </QueryClientProvider>
  )
  return { user: userEvent.setup() }
}

// resolves once the details are loaded
async function drawer(): Promise<HTMLElement> {
  const panel = await screen.findByRole('complementary', { name: 'Детали задачи' })
  await within(panel).findByRole('heading', { name: 'Подготовить КП' })
  return panel
}

describe('TaskDrawer', () => {
  it('renders nothing when no task is selected', () => {
    useTasksStore.setState({ selectedTaskId: null })
    setup()
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('shows a loading state, then the fields', async () => {
    setup(
      mkDetails({
        watchers: [{ id: 'u3', login: 'maria' }],
        deadline: '2099-12-12T10:00:00Z'
      })
    )
    expect(screen.getByRole('status', { name: 'Загрузка задачи' })).toBeTruthy()
    const panel = await drawer()
    expect(within(panel).getByRole('heading', { name: 'Подготовить КП' })).toBeTruthy()
    expect(within(panel).getByText('Описание задачи')).toBeTruthy()
    expect(within(panel).getByText('anna')).toBeTruthy()
    expect(within(panel).getByText('maria')).toBeTruthy()
    expect(within(panel).getByText('admin')).toBeTruthy()
    expect(within(panel).getByRole('combobox', { name: 'Статус' })).toHaveProperty('value', 'todo')
  })

  it('shows the closing time only for a done task', async () => {
    setup(mkDetails({ status: 'done', completedAt: '2026-03-09T10:00:00Z' }))
    const panel = await drawer()
    expect(within(panel).getByText(/Закрыта/)).toBeTruthy()
    cleanup()
    setup(mkDetails({ status: 'todo' }))
    const open = await drawer()
    expect(within(open).queryByText(/Закрыта/)).toBeNull()
  })

  it('closes on Escape and returns focus to the row', async () => {
    const { user } = setup()
    await drawer()
    await user.keyboard('{Escape}')
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Открыть задачу: Подготовить КП' }))
  })

  it('keeps the task open when Escape is pressed in the chats section', async () => {
    const { user } = setup()
    await drawer()
    useUiStore.setState({ section: 'chats' })
    await user.keyboard('{Escape}')
    expect(useTasksStore.getState().selectedTaskId).toBe('t1')
  })

  it('closes with the button', async () => {
    const { user } = setup()
    const panel = await drawer()
    await user.click(within(panel).getByRole('button', { name: 'Закрыть панель' }))
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
  })

  it('reports a task deleted by someone else (404) and closes', async () => {
    setup(new TaskNotFoundError('gone'))
    expect((await screen.findByRole('alert')).textContent).toContain('Задача удалена')
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
    // the notice stays until it is dismissed
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('changes the status from the panel', async () => {
    const { user } = setup()
    const panel = await drawer()
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Статус' }), 'done')
    expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { status: 'done' })
  })

  it('sends only the changed fields', async () => {
    const { user } = setup()
    const panel = await drawer()
    await user.click(within(panel).getByRole('button', { name: 'Редактировать' }))
    const title = within(panel).getByRole('textbox', { name: /Название/ })
    await user.clear(title)
    await user.type(title, 'Новое название')
    await user.click(within(panel).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalledTimes(1))
    expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { title: 'Новое название' })
  })

  it('sends null when the deadline is cleared', async () => {
    const { user } = setup(mkDetails({ deadline: '2099-12-12T10:00:00Z' }))
    const panel = await drawer()
    await user.click(within(panel).getByRole('button', { name: 'Редактировать' }))
    await user.clear(within(panel).getByLabelText('Дедлайн'))
    await user.click(within(panel).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { deadline: null }))
  })

  it('sends null when the assignee is cleared', async () => {
    const { user } = setup()
    const panel = await drawer()
    await user.click(within(panel).getByRole('button', { name: 'Редактировать' }))
    await user.click(within(panel).getByRole('button', { name: /Ответственный/ }))
    await user.click(await screen.findByRole('option', { name: /anna/ }))
    await user.click(within(panel).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { assigneeId: null }))
  })

  it('sends the new watchers and description', async () => {
    const { user } = setup()
    const panel = await drawer()
    await user.click(within(panel).getByRole('button', { name: 'Редактировать' }))
    await user.type(within(panel).getByRole('textbox', { name: 'Описание' }), ' дополнено')
    await user.click(within(panel).getByRole('button', { name: /Наблюдатели/ }))
    await user.click(await screen.findByRole('option', { name: /maria/ }))
    await user.keyboard('{Escape}')
    await user.click(within(panel).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', {
        description: 'Описание задачи дополнено',
        watcherIds: ['u3']
      })
    )
  })

  it('sends nothing when nothing changed', async () => {
    const { user } = setup()
    const panel = await drawer()
    await user.click(within(panel).getByRole('button', { name: 'Редактировать' }))
    await user.click(within(panel).getByRole('button', { name: 'Сохранить' }))
    expect(tasksApi.updateTask).not.toHaveBeenCalled()
    expect(within(panel).queryByRole('button', { name: 'Сохранить' })).toBeNull()
  })

  it('deletes the task after confirmation and closes', async () => {
    const { user } = setup()
    const panel = await drawer()
    await user.click(within(panel).getByRole('button', { name: 'Удалить задачу' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(tasksApi.deleteTask).toHaveBeenCalledWith('t1'))
    await waitFor(() => expect(useTasksStore.getState().selectedTaskId).toBeNull())
  })

  it('keeps the task when the deletion is cancelled', async () => {
    const { user } = setup()
    const panel = await drawer()
    await user.click(within(panel).getByRole('button', { name: 'Удалить задачу' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Отмена' }))
    expect(tasksApi.deleteTask).not.toHaveBeenCalled()
    expect(useTasksStore.getState().selectedTaskId).toBe('t1')
  })
})

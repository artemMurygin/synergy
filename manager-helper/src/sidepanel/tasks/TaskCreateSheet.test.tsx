import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { BackendError, createTask, searchUsers } from '@/shared/tasks-api'
import { makeDetails } from './fixtures'
import { quickDeadlines } from './format'
import { TaskCreateSheet } from './TaskCreateSheet'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  createTask: vi.fn(),
  searchUsers: vi.fn(),
}))

const ME = { id: 'u1', login: 'anna' }

function resizeTo(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 })
  vi.mocked(createTask).mockReset()
  vi.mocked(searchUsers).mockReset()
  vi.mocked(createTask).mockResolvedValue(makeDetails('new'))
  vi.mocked(searchUsers).mockResolvedValue({
    items: [
      { id: 'u2', login: 'ivan' },
      { id: 'u3', login: 'olga' },
    ],
    total: 2,
    limit: 20,
    page: 0,
  })
})

function setup() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const view = render(<TaskCreateSheet me={ME} onCreated={onCreated} onCancel={onCancel} />)
  const title = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Название задачи' })
  const create = () => screen.getByRole('button', { name: /Создать задачу|Создаём/ })
  return { onCreated, onCancel, title, create, view }
}

describe('TaskCreateSheet', () => {
  it('is a modal dialog with the title field focused', () => {
    const { title } = setup()
    const dialog = screen.getByRole('dialog', { name: 'Новая задача' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(title())
  })

  it('creates a task with the title only and the current user as assignee on Enter', async () => {
    const { title, onCreated } = setup()
    fireEvent.change(title(), { target: { value: 'Позвонить клиенту' } })
    fireEvent.keyDown(title(), { key: 'Enter' })
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    expect(createTask).toHaveBeenCalledWith({ title: 'Позвонить клиенту', assigneeId: 'u1' })
  })

  it('creates with ⌘/Ctrl + Enter from the description', async () => {
    const { title, onCreated } = setup()
    fireEvent.change(title(), { target: { value: 'Задача' } })
    const description = screen.getByRole('textbox', { name: 'Описание' })
    fireEvent.change(description, { target: { value: 'Подробности' } })
    fireEvent.keyDown(description, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    expect(createTask).toHaveBeenCalledWith({
      title: 'Задача',
      assigneeId: 'u1',
      description: 'Подробности',
    })
  })

  it('blocks submission with an empty or blank title and explains why', () => {
    const { title, create } = setup()
    expect(create().hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Введите название, чтобы создать задачу')).toBeTruthy()
    fireEvent.keyDown(title(), { key: 'Enter' })
    fireEvent.change(title(), { target: { value: '   ' } })
    fireEvent.keyDown(title(), { key: 'Enter' })
    expect(create().hasAttribute('disabled')).toBe(true)
    expect(createTask).not.toHaveBeenCalled()
  })

  it('does not submit twice while the request is running', async () => {
    let finish: (value: ReturnType<typeof makeDetails>) => void = () => undefined
    vi.mocked(createTask).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { title, create, onCreated } = setup()
    fireEvent.change(title(), { target: { value: 'Задача' } })
    fireEvent.keyDown(title(), { key: 'Enter' })
    fireEvent.keyDown(title(), { key: 'Enter' })
    expect(create().textContent).toMatch(/Создаём/)
    expect(create().hasAttribute('disabled')).toBe(true)
    expect(createTask).toHaveBeenCalledTimes(1)
    finish(makeDetails('new'))
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the draft and shows the error when the server refuses', async () => {
    vi.mocked(createTask).mockRejectedValue(new BackendError('Сервер отклонил запрос'))
    const { title, create, onCreated } = setup()
    fireEvent.change(title(), { target: { value: 'Позвонить' } })
    fireEvent.click(create())
    expect((await screen.findByRole('alert')).textContent).toMatch(/Сервер отклонил запрос/)
    expect(title().value).toBe('Позвонить')
    expect(screen.getByText('Текст сохранён — попробуйте ещё раз')).toBeTruthy()
    expect(onCreated).not.toHaveBeenCalled()
    expect(create().hasAttribute('disabled')).toBe(false)
  })

  it('picks a quick deadline on the second level and sends it', async () => {
    const { title } = setup()
    expect(screen.getByRole('button', { name: /Дедлайн/ }).textContent).toMatch(/Не указан/)
    fireEvent.click(screen.getByRole('button', { name: /Дедлайн/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Завтра/ }))
    expect(screen.getByRole('radio', { name: /Завтра/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(screen.getByRole('button', { name: /Дедлайн/ }).textContent).toMatch(/Завтра, 10:00/)
    fireEvent.change(title(), { target: { value: 'Отчёт' } })
    fireEvent.keyDown(title(), { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
    expect(createTask).toHaveBeenCalledWith({
      title: 'Отчёт',
      assigneeId: 'u1',
      deadline: new Date(quickDeadlines(new Date()).tomorrow).toISOString(),
    })
  })

  it('sends a custom date and time', async () => {
    const { title } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Дедлайн/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Выбрать дату и время/ }))
    fireEvent.change(screen.getByLabelText('Дата и время'), {
      target: { value: '2099-12-12T10:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    fireEvent.change(title(), { target: { value: 'Отчёт' } })
    fireEvent.keyDown(title(), { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
    expect(createTask).toHaveBeenCalledWith({
      title: 'Отчёт',
      assigneeId: 'u1',
      deadline: new Date('2099-12-12T10:00').toISOString(),
    })
  })

  it('chooses the assignee on the second level and sends the chosen user', async () => {
    const { title } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Я · anna/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Ответственный' }), {
      target: { value: 'iv' },
    })
    fireEvent.click(await screen.findByRole('option', { name: 'ivan' }))
    expect(screen.getByRole('button', { name: /Исполнитель/ }).textContent).toMatch(/ivan/)
    fireEvent.change(title(), { target: { value: 'Передать' } })
    fireEvent.keyDown(title(), { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
    expect(createTask).toHaveBeenCalledWith({ title: 'Передать', assigneeId: 'u2' })
  })

  it('adds and removes watchers and sends their ids', async () => {
    const { title } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Наблюдатели/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'ivan' }))
    fireEvent.click(screen.getByRole('option', { name: 'olga' }))
    const chips = screen.getByRole('list', { name: 'Выбранные наблюдатели' })
    expect(within(chips).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Убрать ivan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(screen.getByRole('button', { name: /Наблюдатели/ }).textContent).toMatch(/olga/)
    fireEvent.change(title(), { target: { value: 'Созвон' } })
    fireEvent.keyDown(title(), { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
    expect(createTask).toHaveBeenCalledWith({
      title: 'Созвон',
      assigneeId: 'u1',
      watcherIds: ['u3'],
    })
  })

  it('goes back from the second level with Esc and closes from the first one', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Дедлайн/ }))
    expect(screen.getByRole('heading', { name: 'Дедлайн' })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.getByRole('heading', { name: 'Новая задача' })).toBeTruthy()
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('closes with the cross and with a click on the backdrop, not inside the sheet', () => {
    const { onCancel } = setup()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
    const backdrop = screen.getByRole('dialog').parentElement
    if (backdrop === null) throw new Error('no backdrop')
    fireEvent.mouseDown(backdrop)
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(createTask).not.toHaveBeenCalled()
  })

  it('is a centered dialog with a cancel button in a wide panel', () => {
    const { onCancel } = setup()
    resizeTo(860)
    expect(screen.getByRole('dialog').className).toMatch(/w-150/)
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

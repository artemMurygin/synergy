import { LayoutModeProvider } from '@synergy/ui-kit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import { createTask, searchUsers } from '@/shared/tasks-api'
import { makeTask } from './fixtures'
import { TaskQuickCreateSheet } from './TaskQuickCreateSheet'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  createTask: vi.fn(),
  searchUsers: vi.fn(),
}))

const ME = { id: 'u1', login: 'anna' }
const IVAN = { id: 'u2', login: 'ivan' }

function setup() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  render(
    <LayoutModeProvider mode="mobile">
      <TaskQuickCreateSheet me={ME} onCreated={onCreated} onCancel={onCancel} />
    </LayoutModeProvider>,
  )
  return { onCreated, onCancel }
}

const sheet = () => screen.findByRole('dialog', { name: 'Новая задача' })
const titleField = (dialog: HTMLElement) => within(dialog).getByLabelText('Название')

beforeEach(() => {
  vi.mocked(createTask).mockReset()
  vi.mocked(createTask).mockResolvedValue(makeTask('new'))
  vi.mocked(searchUsers).mockReset()
  vi.mocked(searchUsers).mockResolvedValue({ items: [ME, IVAN], total: 2, limit: 20, page: 0 })
})

describe('TaskQuickCreateSheet', () => {
  it('shows the grabber, the hint, the deadline and assignee chips and the details block', async () => {
    setup()
    const dialog = await sheet()
    expect(within(dialog).getByTestId('sheet-grabber')).toBeTruthy()
    expect(within(dialog).getByText('Enter — создать')).toBeTruthy()
    for (const name of ['Сегодня', 'Завтра', 'Дата…', 'Без срока', 'Я · anna', 'Выбрать…']) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy()
    }
    expect(within(dialog).getByRole('button', { name: 'Описание и наблюдатели' })).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement).toBe(titleField(dialog))
    })
  })

  it('creates a task with the title alone on Enter, the assignee is me', async () => {
    const { onCreated } = setup()
    const dialog = await sheet()
    fireEvent.change(titleField(dialog), { target: { value: 'Позвонить клиенту' } })
    fireEvent.keyDown(titleField(dialog), { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: 'Позвонить клиенту', assigneeId: 'u1' })
    })
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
  })

  it('does not create a task with an empty title', async () => {
    setup()
    const dialog = await sheet()
    expect(within(dialog).getByRole('button', { name: 'Создать задачу' })).toHaveProperty('disabled', true)
    fireEvent.keyDown(titleField(dialog), { key: 'Enter' })
    expect(createTask).not.toHaveBeenCalled()
  })

  it('creates a task due tomorrow after the chip "Завтра" and Enter', async () => {
    setup()
    const dialog = await sheet()
    fireEvent.change(titleField(dialog), { target: { value: 'КП' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Завтра' }))
    expect(within(dialog).getByRole('button', { name: 'Завтра' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(titleField(dialog), { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
    const input = vi.mocked(createTask).mock.calls[0]?.[0]
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(new Date(input?.deadline ?? '').toDateString()).toBe(tomorrow.toDateString())
  })

  it('"Без срока" clears the chosen deadline', async () => {
    setup()
    const dialog = await sheet()
    fireEvent.change(titleField(dialog), { target: { value: 'КП' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сегодня' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Без срока' }))
    fireEvent.keyDown(titleField(dialog), { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: 'КП', assigneeId: 'u1' })
    })
  })

  it('"Дата…" opens the nested sheet "Дедлайн" and "Назад" keeps the typed title', async () => {
    setup()
    const dialog = await sheet()
    fireEvent.change(titleField(dialog), { target: { value: 'Черновик названия' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Дата…' }))
    const nested = await screen.findByRole('dialog', { name: 'Дедлайн' })
    expect(within(nested).getByRole('button', { name: 'Готово' })).toBeTruthy()
    fireEvent.click(within(nested).getByRole('button', { name: 'Назад' }))
    const back = await sheet()
    expect(titleField(back)).toHaveProperty('value', 'Черновик названия')
  })

  it('"Выбрать…" opens "Ответственный", the picked user becomes the chip and "Назад" keeps the title', async () => {
    setup()
    const dialog = await sheet()
    fireEvent.change(titleField(dialog), { target: { value: 'Отчёт' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Выбрать…' }))
    const nested = await screen.findByRole('dialog', { name: 'Ответственный' })
    fireEvent.click(await within(nested).findByRole('button', { name: /ivan/ }))
    fireEvent.click(within(nested).getByRole('button', { name: 'Готово' }))
    const back = await sheet()
    expect(titleField(back)).toHaveProperty('value', 'Отчёт')
    expect(within(back).getByRole('button', { name: 'ivan' })).toBeTruthy()
    fireEvent.keyDown(titleField(back), { key: 'Enter' })
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: 'Отчёт', assigneeId: 'u2' })
    })
  })

  it('"Назад" from "Ответственный" returns without changing the assignee', async () => {
    setup()
    const dialog = await sheet()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Выбрать…' }))
    const nested = await screen.findByRole('dialog', { name: 'Ответственный' })
    fireEvent.click(await within(nested).findByRole('button', { name: /ivan/ }))
    fireEvent.click(within(nested).getByRole('button', { name: 'Назад' }))
    const back = await sheet()
    expect(within(back).getByRole('button', { name: 'Я · anna' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('"Описание и наблюдатели" reveals the extra fields and sends the description', async () => {
    setup()
    const dialog = await sheet()
    expect(within(dialog).queryByLabelText(/Описание/)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Описание и наблюдатели' }))
    fireEvent.change(within(dialog).getByLabelText(/Описание/), { target: { value: 'Детали' } })
    fireEvent.change(titleField(dialog), { target: { value: 'Задача' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать задачу' }))
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: 'Задача', assigneeId: 'u1', description: 'Детали' })
    })
  })

  it('keeps the input and shows the error when the request fails', async () => {
    vi.mocked(createTask).mockRejectedValue(new Error('Сервер недоступен'))
    setup()
    const dialog = await sheet()
    fireEvent.change(titleField(dialog), { target: { value: 'КП' } })
    fireEvent.keyDown(titleField(dialog), { key: 'Enter' })
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(titleField(dialog)).toHaveProperty('value', 'КП')
  })

  it('cancels with the close button', async () => {
    const { onCancel } = setup()
    const dialog = await sheet()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })
})

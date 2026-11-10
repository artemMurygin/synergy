import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TasksApi from '@/shared/tasks-api'
import {
  BackendError,
  TaskNotFoundError,
  downloadAttachment,
  getTask,
  searchUsers,
  updateTask,
} from '@/shared/tasks-api'
import { FIXED_WIDTH, makeDetails } from './fixtures'
import { TaskDetails } from './TaskDetails'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  downloadAttachment: vi.fn(),
  searchUsers: vi.fn(),
}))

const FULL = makeDetails('t1', {
  title: 'Подготовить КП',
  description: 'Собрать условия по программе',
  status: 'in_progress',
  deadline: '2099-12-12T12:00:00.000Z',
  creator: { id: 'u3', login: 'petr' },
  assignee: { id: 'u1', login: 'anna' },
  watchers: [
    { id: 'u2', login: 'ivan' },
    { id: 'u4', login: 'olga' },
  ],
  attachments: [
    {
      id: 'a1',
      taskId: 't1',
      originalName: 'Предложение.pdf',
      sizeBytes: 1_468_006,
      contentType: 'application/pdf',
      uploadedBy: 'u3',
      createdAt: '2026-11-02T00:00:00.000Z',
    },
  ],
})

beforeEach(() => {
  vi.mocked(getTask).mockReset()
  vi.mocked(updateTask).mockReset()
  vi.mocked(downloadAttachment).mockReset()
  vi.mocked(searchUsers).mockReset()
  vi.mocked(getTask).mockResolvedValue(FULL)
  vi.mocked(updateTask).mockImplementation((_id, patch) =>
    Promise.resolve({
      ...FULL,
      status: patch.status ?? FULL.status,
      title: patch.title ?? FULL.title,
    }),
  )
  vi.mocked(searchUsers).mockResolvedValue({
    items: [{ id: 'u2', login: 'ivan' }],
    total: 1,
    limit: 20,
    page: 0,
  })
})

function setup(props: Partial<Parameters<typeof TaskDetails>[0]> = {}) {
  const handlers = { onBack: vi.fn(), onChanged: vi.fn(), onMissing: vi.fn() }
  render(<TaskDetails taskId="t1" {...handlers} {...props} />)
  return handlers
}

describe('TaskDetails view', () => {
  it('shows all fields of the task', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Подготовить КП' })).toBeTruthy()
    expect(screen.getByText('Собрать условия по программе')).toBeTruthy()
    expect(screen.getByText(/12 дек/)).toBeTruthy()
    expect(screen.getByText('petr')).toBeTruthy()
    expect(screen.getByText('anna')).toBeTruthy()
    expect(screen.getByText('ivan, olga')).toBeTruthy()
    expect(screen.getByText('Предложение.pdf')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'В работе' }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('shows the loading state', () => {
    vi.mocked(getTask).mockReturnValue(new Promise(() => undefined))
    setup()
    expect(screen.getByRole('status', { name: 'Загрузка задачи' })).toBeTruthy()
  })

  it('shows the error with "Повторить" that reloads', async () => {
    vi.mocked(getTask).mockRejectedValueOnce(new BackendError('Сбой'))
    setup()
    expect((await screen.findByRole('alert')).textContent).toMatch(/Сбой/)
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('heading', { name: 'Подготовить КП' })).toBeTruthy()
  })

  it('reports a missing task (404) so the screen returns to the list', async () => {
    vi.mocked(getTask).mockRejectedValue(new TaskNotFoundError('нет'))
    const { onMissing } = setup()
    await waitFor(() => {
      expect(onMissing).toHaveBeenCalledWith('t1')
    })
  })

  it('has a "Назад" button only when a way back is given', async () => {
    const { onBack } = setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('has no "Назад" button in the wide layout', async () => {
    setup({ onBack: undefined })
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
  })
})

describe('TaskDetails actions', () => {
  it('changes the status with one click', async () => {
    const { onChanged } = setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('radio', { name: 'Готово' }))
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(updateTask).toHaveBeenCalledWith('t1', { status: 'done' })
    expect(screen.getByRole('radio', { name: 'Готово' }).getAttribute('aria-checked')).toBe('true')
  })

  it('rolls the status back with a message when the server refuses', async () => {
    vi.mocked(updateTask).mockRejectedValue(new BackendError('Отказ'))
    setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('radio', { name: 'Готово' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Отказ/)
    expect(screen.getByRole('radio', { name: 'В работе' }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('edits the title, description and deadline and sends only the changes', async () => {
    const { onChanged } = setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новое название' } })
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Новое описание' } })
    fireEvent.change(screen.getByLabelText('Дедлайн'), { target: { value: '2099-12-20T09:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(updateTask).toHaveBeenCalledWith('t1', {
      title: 'Новое название',
      description: 'Новое описание',
      deadline: new Date('2099-12-20T09:30').toISOString(),
    })
    expect(screen.queryByLabelText('Название')).toBeNull()
  })

  it('does not save an empty title', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: '  ' } })
    expect(screen.getByRole('button', { name: 'Сохранить' }).hasAttribute('disabled')).toBe(true)
  })

  it('changes the assignee through the user search', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Ответственный' }), {
      target: { value: 'iv' },
    })
    fireEvent.click(await screen.findByRole('option', { name: 'ivan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith('t1', { assigneeId: 'u2' })
    })
  })

  it('keeps the form and shows the error when saving fails', async () => {
    vi.mocked(updateTask).mockRejectedValue(new BackendError('Не сохранилось'))
    setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Другое' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Не сохранилось/)
    expect(screen.getByLabelText<HTMLInputElement>('Название').value).toBe('Другое')
  })

  it('cancels editing without a request', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Другое' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(updateTask).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Подготовить КП' })).toBeTruthy()
  })

  it('downloads an attachment under its original name', async () => {
    const blob = new Blob(['x'])
    vi.mocked(downloadAttachment).mockResolvedValue({ blob, fileName: 'Предложение.pdf' })
    const createObjectURL = vi.fn().mockReturnValue('blob:file')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    let name = ''
    click.mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download
    })
    setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('button', { name: 'Скачать Предложение.pdf' }))
    await waitFor(() => {
      expect(click).toHaveBeenCalled()
    })
    expect(downloadAttachment).toHaveBeenCalledWith('t1', 'a1')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(name).toBe('Предложение.pdf')
    click.mockRestore()
  })

  it('shows a message when the attachment cannot be downloaded', async () => {
    vi.mocked(downloadAttachment).mockRejectedValue(new BackendError('Файл недоступен'))
    setup()
    await screen.findByRole('heading', { name: 'Подготовить КП' })
    fireEvent.click(screen.getByRole('button', { name: 'Скачать Предложение.pdf' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Файл недоступен/)
  })
})

describe('TaskDetails in a 320 px panel', () => {
  it('has no fixed widths and lets long text wrap', async () => {
    vi.mocked(getTask).mockResolvedValue({
      ...FULL,
      title: 'Очень-длинное-название-'.repeat(6),
    })
    setup()
    const heading = await screen.findByRole('heading')
    expect(heading.className).toMatch(/break-words|wrap-anywhere/)
    const html = document.body.innerHTML
    expect(html).not.toMatch(FIXED_WIDTH)
    expect(html).not.toMatch(/style="[^"]*width/)
  })
})

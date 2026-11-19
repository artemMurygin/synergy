import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeDetails, NOW } from './fixtures'
import { TaskDetails, type TaskDetailsProps } from './TaskDetails'
import { TaskNotFound } from './TaskNotFound'

function setup(over: Partial<TaskDetailsProps> = {}) {
  const props: TaskDetailsProps = {
    task: makeDetails({ watchers: [{ id: 'u3', login: 'ivan' }] }),
    now: NOW,
    me: { id: 'u1', login: 'maria' },
    userSearch: { users: [{ id: 'u1', login: 'maria' }, { id: 'u4', login: 'petr' }], onSearch: vi.fn() },
    onPatch: vi.fn(),
    onStatus: vi.fn(),
    onUpload: vi.fn(() => Promise.resolve()),
    onDeleteAttachment: vi.fn(() => Promise.resolve()),
    onDownload: vi.fn(() => Promise.resolve()),
    onDelete: vi.fn(),
    ...over,
  }
  render(<TaskDetails {...props} />)
  return props
}

describe('TaskDetails', () => {
  it('показывает поля задачи', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Подготовить КП' })).toBeTruthy()
    expect(screen.getByText('Собрать условия')).toBeTruthy()
    expect(screen.getByText('anna')).toBeTruthy()
    expect(screen.getByText('ivan')).toBeTruthy()
    expect(screen.getByText('КП_МВА.pdf')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Статус: В работе/ })).toBeTruthy()
  })

  it('«Просрочено» текстом', () => {
    setup({ task: makeDetails({ deadline: '2026-11-01T10:00:00' }) })
    expect(screen.getAllByText(/Просрочено/).length).toBeGreaterThan(0)
  })

  it('правка названия отправляет onPatch', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Изменить название' }))
    const input = screen.getByRole('textbox', { name: 'Название' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Новое{Enter}')
    expect(props.onPatch).toHaveBeenCalledWith({ title: 'Новое' })
  })

  it('пустое название не отправляется', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Изменить название' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Название' }))
    await userEvent.keyboard('{Enter}')
    expect(props.onPatch).not.toHaveBeenCalled()
  })

  it('Escape отменяет правку названия', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Изменить название' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Название' }), 'x{Escape}')
    expect(props.onPatch).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Подготовить КП' })).toBeTruthy()
  })

  it('правка описания по blur', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Изменить описание' }))
    const area = screen.getByRole('textbox', { name: 'Описание' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Текст')
    fireEvent.blur(area)
    expect(props.onPatch).toHaveBeenCalledWith({ description: 'Текст' })
  })

  it('дедлайн: изменение и очистка', async () => {
    const props = setup()
    fireEvent.change(screen.getByLabelText('Дедлайн'), { target: { value: '2026-12-20T10:00' } })
    expect(props.onPatch).toHaveBeenCalledWith({ deadline: new Date('2026-12-20T10:00').toISOString() })
    await userEvent.click(screen.getByRole('button', { name: 'Убрать дедлайн' }))
    expect(props.onPatch).toHaveBeenLastCalledWith({ deadline: null })
  })

  it('смена статуса одним действием «Готово»', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(props.onStatus).toHaveBeenCalledWith('done')
  })

  it('смена статуса через меню', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: /Статус: В работе/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'К выполнению' }))
    expect(props.onStatus).toHaveBeenCalledWith('todo')
  })

  it('смена ответственного', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Ответственный' }))
    await userEvent.click(await screen.findByRole('option', { name: /petr/ }))
    expect(props.onPatch).toHaveBeenCalledWith({ assigneeId: 'u4' })
  })

  it('смена наблюдателей', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Убрать ivan' }))
    expect(props.onPatch).toHaveBeenCalledWith({ watcherIds: [] })
  })

  it('удаление задачи — только после подтверждения', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить задачу' }))
    expect(props.onDelete).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    expect(props.onDelete).toHaveBeenCalled()
  })

  it('отмена удаления', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить задачу' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it('«Назад» только при onBack', async () => {
    const onBack = vi.fn()
    setup()
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
    cleanup()
    setup({ onBack })
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('сообщение об ошибке показывается алертом', () => {
    setup({ message: 'Не удалось сохранить' })
    expect(screen.getByRole('alert').textContent).toContain('Не удалось сохранить')
  })
})

describe('TaskNotFound', () => {
  it('сообщение и возврат к списку', async () => {
    const onBack = vi.fn()
    render(<TaskNotFound onBack={onBack} />)
    expect(screen.getByText('Задача не найдена')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'К списку задач' }))
    expect(onBack).toHaveBeenCalled()
  })
})

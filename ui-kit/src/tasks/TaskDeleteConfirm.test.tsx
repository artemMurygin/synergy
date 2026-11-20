import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../layout/layout-mode'
import { TaskDeleteConfirm } from './TaskDeleteConfirm'

function setup(mode: LayoutMode, pending = false) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <LayoutModeProvider mode={mode}>
      <TaskDeleteConfirm taskTitle="Подготовить КП" pending={pending} onConfirm={onConfirm} onCancel={onCancel} />
    </LayoutModeProvider>,
  )
  return { onConfirm, onCancel }
}

describe('TaskDeleteConfirm', () => {
  it('desktop: диалог с текстом, «Удалить» и «Отмена»', async () => {
    const { onConfirm, onCancel } = setup('desktop')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Удалить задачу?')).toBeTruthy()
    expect(dialog.textContent).toContain('Задача «Подготовить КП» пропадёт из списков. Вложения станут недоступны.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('mobile: шторка с захватом и кнопкой «Удалить задачу»', async () => {
    const { onConfirm } = setup('mobile')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('sheet-grabber')).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить задачу' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeTruthy()
  })

  it('pending блокирует кнопки', async () => {
    setup('tablet', true)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Удалить' }).hasAttribute('disabled')).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Отмена' }).hasAttribute('disabled')).toBe(true)
  })
})

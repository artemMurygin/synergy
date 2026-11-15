import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WontFixDialog } from './WontFixDialog'

afterEach(cleanup)

function renderDialog(props: Partial<React.ComponentProps<typeof WontFixDialog>> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(<WontFixDialog open onConfirm={onConfirm} onClose={onClose} pending={false} {...props} />)
  return { onConfirm, onClose }
}

describe('WontFixDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('disables the confirmation while the reason is empty or blank', async () => {
    const user = userEvent.setup()
    renderDialog()
    const confirm = screen.getByRole('button', { name: 'Закрыть без исправления' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('0 / 2000')).toBeTruthy()
    await user.type(screen.getByLabelText('Причина'), '   ')
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
  })

  it('confirms with the trimmed reason and limits it to 2000 characters', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    const field = screen.getByLabelText('Причина') as HTMLTextAreaElement
    expect(field.maxLength).toBe(2000)
    await user.type(field, '  Это повтор  ')
    expect(screen.getByText(/Если это повтор, укажите название или дату/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Закрыть без исправления' }))
    expect(onConfirm).toHaveBeenCalledWith('Это повтор')
  })

  it('cancels and disables the buttons while pending', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClose).toHaveBeenCalled()
    cleanup()
    renderDialog({ pending: true })
    expect((screen.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Закрыть без исправления' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './confirm-dialog'
import { afterEach, describe, expect, it, vi } from 'vitest'

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      open
      title="Уволить Иванова Ивана Ивановича?"
      description="Сотрудник потеряет доступ к порталу"
      confirmLabel="Уволить"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  )
  return { onConfirm, onCancel }
}

afterEach(cleanup)

function describedBy(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
}

describe('ConfirmDialog', () => {
  it('is an alertdialog with title and description, focus on the safe "Отмена" button', () => {
    setup()
    const dialog = screen.getByRole('alertdialog', { name: 'Уволить Иванова Ивана Ивановича?' })
    expect(describedBy(dialog)).toBe('Сотрудник потеряет доступ к порталу')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Отмена' }))
  })

  it('confirms', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels with the button and with Escape', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables both buttons while pending', () => {
    setup({ pending: true })
    expect((screen.getByRole('button', { name: 'Уволить' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders an extra warning in the slot', () => {
    setup({ children: <p>Вы потеряете доступ к порталу</p> })
    expect(screen.getByText('Вы потеряете доступ к порталу')).toBeTruthy()
  })

  it('has no header close button and shows the icon disc', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull()
    const disc = screen.getByTestId('confirm-icon-disc')
    expect(disc.className).toContain('size-12')
    expect(disc.className).toContain('rounded-pill')
    expect(disc.className).toContain('bg-brand-red-soft')
  })

  it('accepts a custom icon', () => {
    setup({ icon: <svg data-testid="custom-icon" /> })
    expect(screen.getByTestId('custom-icon')).toBeTruthy()
  })

  it('lays out the card as 24 padding, gap 16, title 20/700 with 1.25 line height', () => {
    setup()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.className).toContain('p-6')
    expect(dialog.className).toContain('gap-4')
    const title = screen.getByRole('heading', { name: 'Уволить Иванова Ивана Ивановича?' })
    expect(title.className).toContain('leading-[1.25]')
  })

  it('keeps the red action and the white cancel while pending, only faded (fy9Pj)', () => {
    setup({ pending: true, confirmLabel: 'Увольняем…' })
    const action = screen.getByRole('button', { name: 'Увольняем…' })
    expect(action.className).toContain('disabled:bg-brand-red')
    expect(action.className).toContain('disabled:text-surface')
    expect(action.className).toContain('disabled:opacity-60')
    expect(action.className).not.toContain('disabled:bg-surface-sunken')
    const cancel = screen.getByRole('button', { name: 'Отмена' })
    expect(cancel.className).toContain('disabled:bg-surface')
    expect(cancel.className).toContain('disabled:opacity-50')
  })
})

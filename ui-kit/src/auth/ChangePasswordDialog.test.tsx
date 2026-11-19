import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../layout/layout-mode'
import { ChangePasswordDialog } from './ChangePasswordDialog'

type Props = Parameters<typeof ChangePasswordDialog>[0]

function setup(props: Partial<Props> & { mode?: LayoutMode } = {}) {
  const { mode = 'desktop', ...rest } = props
  const onSubmit = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <LayoutModeProvider mode={mode}>
      <ChangePasswordDialog
        kind="voluntary"
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        pending={false}
        {...rest}
      />
    </LayoutModeProvider>,
  )
  return { onSubmit, onOpenChange }
}

async function fill(current: string, next: string, repeat: string) {
  await userEvent.type(screen.getByLabelText(/^(Текущий|Временный) пароль$/), current)
  await userEvent.type(screen.getByLabelText('Новый пароль'), next)
  await userEvent.type(screen.getByLabelText('Повторите новый пароль'), repeat)
}

describe('ChangePasswordDialog', () => {
  it('voluntary: opens as a dialog in desktop mode and can be closed', async () => {
    const { onOpenChange } = setup()
    expect(screen.getByRole('dialog', { name: 'Смена пароля' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('voluntary: opens as a bottom sheet in mobile mode', () => {
    setup({ mode: 'mobile' })
    const sheet = screen.getByRole('dialog', { name: 'Смена пароля' })
    expect(sheet.getAttribute('data-side')).toBe('bottom')
  })

  it('forced: has no way to close and is not a dismissable dialog', async () => {
    const { onOpenChange } = setup({ kind: 'forced' })
    expect(screen.getByRole('heading', { name: 'Смена временного пароля' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Отмена' })).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Смена временного пароля' })).toBeTruthy()
  })

  it('forced: offers logout when onLogout is given', async () => {
    const onLogout = vi.fn()
    setup({ kind: 'forced', onLogout })
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('validates empty fields', async () => {
    const { onSubmit } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }))
    expect(screen.getByText('Введите текущий пароль')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('validates the new password rule and the repeat', async () => {
    const { onSubmit } = setup()
    await fill('old', 'short', 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }))
    expect(screen.getAllByText('Не короче 10 символов, буква и цифра').length).toBeGreaterThan(0)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('validates that the repeat matches', async () => {
    const { onSubmit } = setup()
    await fill('old', 'Password12345', 'Password1234x')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }))
    expect(screen.getByText('Пароли не совпадают')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits current and next password', async () => {
    const { onSubmit } = setup()
    await fill('old-pass', 'Password12345', 'Password12345')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }))
    expect(onSubmit).toHaveBeenCalledWith({ currentPassword: 'old-pass', newPassword: 'Password12345' })
  })

  it('shows a server error and the pending label', () => {
    setup({ error: 'Текущий пароль неверен', pending: true })
    expect(screen.getByRole('alert').textContent).toContain('Текущий пароль неверен')
    expect(screen.getByRole('button', { name: 'Сохраняем…' })).toHaveProperty('disabled', true)
  })
})

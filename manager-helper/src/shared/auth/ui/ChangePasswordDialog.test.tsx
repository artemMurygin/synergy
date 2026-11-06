import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChangePasswordDialog } from './ChangePasswordDialog'

function fill(current: string, next: string, repeat: string) {
  fireEvent.change(screen.getByLabelText('Временный пароль'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: repeat } })
}

const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }))
}

describe('ChangePasswordDialog', () => {
  it('submits the current and the new password', () => {
    const onSubmit = vi.fn()
    render(<ChangePasswordDialog onSubmit={onSubmit} onLogout={vi.fn()} />)
    fill('temp-pass-1', 'brand-new-2', 'brand-new-2')
    submit()
    expect(onSubmit).toHaveBeenCalledWith('temp-pass-1', 'brand-new-2')
  })

  it('refuses a confirmation that does not match', () => {
    const onSubmit = vi.fn()
    render(<ChangePasswordDialog onSubmit={onSubmit} onLogout={vi.fn()} />)
    fill('temp-pass-1', 'brand-new-2', 'brand-new-3')
    submit()
    expect(screen.getByText('Пароли не совпадают')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses a new password equal to the temporary one', () => {
    const onSubmit = vi.fn()
    render(<ChangePasswordDialog onSubmit={onSubmit} onLogout={vi.fn()} />)
    fill('temp-pass-1', 'temp-pass-1', 'temp-pass-1')
    submit()
    expect(screen.getByText('Новый пароль не должен совпадать с временным')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lists the policy violations from the server', () => {
    render(
      <ChangePasswordDialog
        onSubmit={vi.fn()}
        onLogout={vi.fn()}
        violations={['Минимум 10 символов', 'Нужна цифра']}
      />,
    )
    expect(screen.getByText('Минимум 10 символов')).toBeTruthy()
    expect(screen.getByText('Нужна цифра')).toBeTruthy()
  })

  it('translates policy violation codes into readable text', () => {
    render(
      <ChangePasswordDialog
        onSubmit={vi.fn()}
        onLogout={vi.fn()}
        violations={['too-short', 'no-letter', 'no-digit', 'same-as-login', 'same-as-current']}
      />,
    )
    expect(screen.getByText('Пароль короче 10 символов')).toBeTruthy()
    expect(screen.getByText('Добавьте хотя бы одну букву')).toBeTruthy()
    expect(screen.getByText('Добавьте хотя бы одну цифру')).toBeTruthy()
    expect(screen.getByText('Пароль не должен совпадать с логином')).toBeTruthy()
    expect(screen.getByText('Новый пароль не должен совпадать с текущим')).toBeTruthy()
    expect(screen.queryByText('too-short')).toBeNull()
  })

  it('shows a wrong temporary password reported by the server', () => {
    render(<ChangePasswordDialog onSubmit={vi.fn()} onLogout={vi.fn()} error="wrong-password" />)
    expect(screen.getByRole('alert').textContent).toContain('Неверный временный пароль')
  })

  it('shows the server-side same password error', () => {
    render(<ChangePasswordDialog onSubmit={vi.fn()} onLogout={vi.fn()} error="same-password" />)
    expect(screen.getByText('Новый пароль не должен совпадать с временным')).toBeTruthy()
  })

  it('has no close button and logs out through the link', () => {
    const onLogout = vi.fn()
    render(<ChangePasswordDialog onSubmit={vi.fn()} onLogout={onLogout} />)
    expect(screen.queryByRole('button', { name: /закрыть/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})

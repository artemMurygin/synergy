import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  it('validates empty fields and does not submit', async () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} pending={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(screen.getByText('Введите логин')).toBeTruthy()
    expect(screen.getByText('Введите пароль')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed login and password', async () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} pending={false} />)
    await userEvent.type(screen.getByLabelText('Логин'), ' user10 ')
    await userEvent.type(screen.getByLabelText('Пароль'), 'Test123456{Enter}')
    expect(onSubmit).toHaveBeenCalledWith({ login: 'user10', password: 'Test123456' })
  })

  it('disables the form while pending', () => {
    render(<LoginForm onSubmit={() => undefined} pending />)
    const button = screen.getByRole('button', { name: 'Входим…' })
    expect(button).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Логин')).toHaveProperty('disabled', true)
  })

  it('shows a server error as an alert', () => {
    render(<LoginForm onSubmit={() => undefined} pending={false} error="Неверный логин или пароль" />)
    expect(screen.getByRole('alert').textContent).toContain('Неверный логин или пароль')
  })

  it('renders the footer slot', () => {
    render(<LoginForm onSubmit={() => undefined} pending={false} footer={<span>Сервер: localhost</span>} />)
    expect(screen.getByText('Сервер: localhost')).toBeTruthy()
  })
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

const base = {
  error: null,
  retryAfter: null,
  serverUrl: 'http://localhost:3000',
  onChangeServer: () => undefined,
}

function fill(login: string, password: string) {
  fireEvent.change(screen.getByLabelText('Логин'), { target: { value: login } })
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: password } })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('LoginForm', () => {
  it('submits the entered login and password', () => {
    const onSubmit = vi.fn()
    render(<LoginForm {...base} onSubmit={onSubmit} />)
    fill('manager1', 'secret-pass1')
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(onSubmit).toHaveBeenCalledWith('manager1', 'secret-pass1')
  })

  it('does not submit while a field is empty', () => {
    const onSubmit = vi.fn()
    render(<LoginForm {...base} onSubmit={onSubmit} />)
    const button = screen.getByRole('button', { name: 'Войти' })
    expect(button.hasAttribute('disabled')).toBe(true)
    fill('manager1', '')
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.submit(screen.getByRole('button', { name: 'Войти' }).closest('form') ?? button)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the 401 error', () => {
    render(<LoginForm {...base} onSubmit={vi.fn()} error="Неверный логин или пароль" />)
    expect(screen.getByRole('alert').textContent).toContain('Неверный логин или пароль')
  })

  it('blocks the button and counts down after 429', () => {
    vi.useFakeTimers()
    const onSubmit = vi.fn()
    render(<LoginForm {...base} onSubmit={onSubmit} retryAfter={872} />)
    fill('manager1', 'secret-pass1')
    const blocked = screen.getByRole('button', { name: 'Войти (14:32)' })
    expect(blocked.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Слишком много попыток')
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('button', { name: 'Войти (14:30)' })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(870_000)
    })
    const ready = screen.getByRole('button', { name: 'Войти' })
    expect(ready.hasAttribute('disabled')).toBe(false)
  })

  it('shows the server address and opens its settings', () => {
    const onChangeServer = vi.fn()
    render(<LoginForm {...base} onSubmit={vi.fn()} onChangeServer={onChangeServer} />)
    expect(screen.getByText(/localhost:3000/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    expect(onChangeServer).toHaveBeenCalledTimes(1)
  })
})

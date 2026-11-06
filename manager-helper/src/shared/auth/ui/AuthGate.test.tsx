import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvalidCredentialsError, RateLimitedError, WeakPasswordError } from '../auth-api'
import type { AuthSession } from '../use-auth-session'
import { useAuthSession } from '../use-auth-session'
import { AuthGate } from './AuthGate'

vi.mock('../use-auth-session')
vi.mock('@/shared/settings', () => ({
  getBackendUrl: () => Promise.resolve('http://localhost:3000'),
}))

let session: AuthSession

function setSession(patch: Partial<AuthSession>) {
  session = {
    status: 'anonymous',
    user: null,
    notice: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
    ...patch,
  }
  vi.mocked(useAuthSession).mockReturnValue(session)
}

function signIn() {
  fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'manager1' } })
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secret-pass1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
}

beforeEach(() => {
  setSession({})
})

describe('AuthGate', () => {
  it('shows the children for an authenticated session', () => {
    setSession({ status: 'authenticated' })
    render(<AuthGate>chat</AuthGate>)
    expect(screen.getByText('chat')).toBeTruthy()
  })

  it('shows the login form for an anonymous session', () => {
    render(<AuthGate>chat</AuthGate>)
    expect(screen.queryByText('chat')).toBeNull()
    expect(screen.getByLabelText('Логин')).toBeTruthy()
  })

  it('warns on the login form that an offline logout may have left the server session alive', () => {
    setSession({ status: 'anonymous', notice: 'logout-offline' })
    render(<AuthGate>chat</AuthGate>)
    expect(screen.getByLabelText('Логин')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Вы вышли без связи с сервером')
  })

  it('shows no warning without the notice', () => {
    render(<AuthGate>chat</AuthGate>)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the restoring screen', () => {
    setSession({ status: 'restoring' })
    render(<AuthGate>chat</AuthGate>)
    expect(screen.getByText('Восстанавливаем сессию…')).toBeTruthy()
    expect(screen.queryByLabelText('Логин')).toBeNull()
  })

  it('shows the offline screen and retries', () => {
    setSession({ status: 'offline' })
    render(<AuthGate>chat</AuthGate>)
    expect(screen.getByText('Нет связи с сервером')).toBeTruthy()
    expect(screen.queryByLabelText('Логин')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(session.retry).toHaveBeenCalledTimes(1)
  })

  it('shows the password change dialog and logs out from it', () => {
    setSession({ status: 'must-change-password' })
    render(<AuthGate>chat</AuthGate>)
    expect(screen.queryByText('chat')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Смените пароль' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(session.logout).toHaveBeenCalledTimes(1)
  })

  it('logs in and shows a 401 as invalid credentials', async () => {
    setSession({
      login: vi
        .fn()
        .mockRejectedValue(new InvalidCredentialsError('x', 401, 'INVALID_CREDENTIALS')),
    })
    render(<AuthGate>chat</AuthGate>)
    signIn()
    expect(session.login).toHaveBeenCalledWith('manager1', 'secret-pass1')
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Неверный логин или пароль')
    })
  })

  it('blocks the form after a 429', async () => {
    setSession({ login: vi.fn().mockRejectedValue(new RateLimitedError('x', 90)) })
    render(<AuthGate>chat</AuthGate>)
    signIn()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Войти (01:30)' })).toBeTruthy()
    })
  })

  it('passes weak password violations to the dialog', async () => {
    setSession({
      status: 'must-change-password',
      changePassword: vi.fn().mockRejectedValue(new WeakPasswordError('x', ['Нужна цифра'])),
    })
    render(<AuthGate>chat</AuthGate>)
    fireEvent.change(screen.getByLabelText('Временный пароль'), {
      target: { value: 'temp-pass-1' },
    })
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'newpassword' } })
    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), {
      target: { value: 'newpassword' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }))
    await waitFor(() => {
      expect(screen.getByText('Нужна цифра')).toBeTruthy()
    })
  })
})

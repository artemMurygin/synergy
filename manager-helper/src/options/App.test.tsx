import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/shared/auth'
import { useAuthSession } from '@/shared/auth'
import { App } from './App'

vi.mock('@/shared/auth', () => ({ useAuthSession: vi.fn() }))
vi.mock('@/shared/settings', () => ({
  DEFAULT_BACKEND_URL: 'http://77.105.146.171:1234',
  getBackendUrl: () => Promise.resolve('http://77.105.146.171:1234'),
  normalizeBackendUrl: (v: string) => v,
  setBackendUrl: vi.fn(),
}))

function setSession(patch: Partial<AuthSession>) {
  vi.mocked(useAuthSession).mockReturnValue({
    status: 'anonymous',
    user: null,
    notice: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
    ...patch,
  })
}

beforeEach(() => {
  setSession({})
})

describe('options App account block', () => {
  it('shows who is signed in and a logout button', async () => {
    const logout = vi.fn()
    setSession({ status: 'authenticated', user: { id: '1', login: 'manager1' }, logout })
    render(<App />)
    expect(screen.getByText('Вы вошли как manager1')).toBeTruthy()
    screen.getByRole('button', { name: 'Выйти' }).click()
    expect(logout).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByDisplayValue('http://77.105.146.171:1234')).toBeTruthy()
    })
  })

  it('shows a hint without a session and keeps the server address available', () => {
    render(<App />)
    expect(screen.getByText(/Войдите в боковой панели/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
    expect(screen.getByLabelText('Адрес сервера')).toBeTruthy()
  })
})

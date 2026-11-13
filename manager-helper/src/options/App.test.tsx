import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/shared/auth'
import { useAuthSession } from '@/shared/auth'
import { getPortalUrl, setBackendUrl, setPortalUrl } from '@/shared/settings'
import { App } from './App'

vi.mock('@/shared/auth', () => ({ useAuthSession: vi.fn() }))
vi.mock('@/shared/settings', () => ({
  DEFAULT_BACKEND_URL: 'http://localhost:3000',
  getBackendUrl: () => Promise.resolve('http://localhost:3000'),
  normalizeBackendUrl: (v: string) => v,
  setBackendUrl: vi.fn(),
  getPortalUrl: vi.fn(),
  setPortalUrl: vi.fn(),
}))
vi.mock('./telegram/TelegramSection', () => ({
  TelegramSection: () => <section aria-label="Telegram" />,
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
  vi.mocked(getPortalUrl).mockResolvedValue(null)
  vi.mocked(setBackendUrl).mockResolvedValue(true)
  vi.mocked(setPortalUrl).mockResolvedValue(true)
})

describe('options App portal address', () => {
  it('shows the saved portal address', async () => {
    vi.mocked(getPortalUrl).mockResolvedValue('https://portal.example.com')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Адрес портала')).toHaveProperty(
        'value',
        'https://portal.example.com',
      )
    })
  })

  it('saves the portal address with the settings', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Адрес портала'), {
      target: { value: 'https://portal.example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => {
      expect(setPortalUrl).toHaveBeenCalledWith('https://portal.example.com')
    })
    expect(await screen.findByText('Сохранено')).toBeTruthy()
  })

  it('reports an invalid portal address', async () => {
    vi.mocked(setPortalUrl).mockResolvedValue(false)
    render(<App />)
    fireEvent.change(screen.getByLabelText('Адрес портала'), { target: { value: 'oops' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText(/Адрес портала/)).toBeTruthy()
  })
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
      expect(screen.getByDisplayValue('http://localhost:3000')).toBeTruthy()
    })
  })

  it('shows a hint without a session and keeps the server address available', () => {
    render(<App />)
    expect(screen.getByText(/Войдите в боковой панели/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
    expect(screen.getByLabelText('Адрес сервера')).toBeTruthy()
  })

  it('renders the Telegram section after the account block', () => {
    render(<App />)
    const account = screen.getByRole('heading', { name: 'Аккаунт' })
    const telegram = screen.getByRole('region', { name: 'Telegram' })
    expect(
      account.compareDocumentPosition(telegram) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/shared/auth'
import { useAuthSession } from '@/shared/auth'
import { linkedState, makeLink } from '@/sidepanel/telegram/link-fixtures.testing'
import { TelegramSection } from './TelegramSection'
import type { TelegramLinkState } from './use-telegram-link'
import { useTelegramLink } from './use-telegram-link'

vi.mock('@/shared/auth', () => ({ useAuthSession: vi.fn() }))
vi.mock('./use-telegram-link', () => ({ useTelegramLink: vi.fn() }))

function setLink(state: TelegramLinkState, remainingMs = 0) {
  const link = makeLink(state, remainingMs)
  vi.mocked(useTelegramLink).mockReturnValue(link)
  return link
}

beforeEach(() => {
  vi.clearAllMocks()
  const session: AuthSession = {
    status: 'authenticated',
    user: { id: '1', login: 'manager1' },
    notice: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
  }
  vi.mocked(useAuthSession).mockReturnValue(session)
})

describe('TelegramSection', () => {
  it('passes the auth status to the hook', () => {
    setLink({ kind: 'idle' })
    render(<TelegramSection />)
    expect(useTelegramLink).toHaveBeenCalledWith('authenticated')
  })

  it('is hidden when the bot is not configured on the server', () => {
    setLink({ kind: 'unavailable' })
    const { container } = render(<TelegramSection />)
    expect(container.textContent).toBe('')
  })

  it('shows the status load and the sign-in hint', () => {
    setLink({ kind: 'loading' })
    const { unmount } = render(<TelegramSection />)
    expect(screen.getByRole('status').textContent).toContain('Загружаем статус Telegram')
    unmount()
    setLink({ kind: 'signed-out' })
    render(<TelegramSection />)
    expect(screen.getByText(/войдите в боковой панели/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull()
  })

  it('connects from the not linked state with the same panel as the side panel', async () => {
    const link = setLink({ kind: 'idle' })
    render(<TelegramSection />)
    expect(screen.getByRole('region', { name: 'Подключение Telegram' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Подключить' }))
    expect(link.connect).toHaveBeenCalledTimes(1)
  })

  it('shows the waiting state with the countdown', () => {
    setLink(
      { kind: 'waiting', url: 'https://t.me/b?start=1', botUsername: 'b', expiresAt: 'x' },
      9_100,
    )
    render(<TelegramSection />)
    expect(screen.getByText(/0:10/)).toBeTruthy()
  })

  it('shows the not configured message without a connect button', () => {
    setLink({ kind: 'not-configured' })
    render(<TelegramSection />)
    expect(screen.getByText('Telegram-бот не настроен')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull()
  })

  it('reloads after a status load error', async () => {
    const link = setLink({ kind: 'load-error', message: 'Нет связи' })
    render(<TelegramSection />)
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(link.reload).toHaveBeenCalledTimes(1)
  })

  it('shows the linked account and unlinks after the confirmation', async () => {
    const link = setLink(linkedState())
    render(<TelegramSection />)
    expect(screen.getByText('@ivanov_tg')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Отключить Telegram/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Отключить' }))
    expect(link.unlink).toHaveBeenCalledTimes(1)
  })
})

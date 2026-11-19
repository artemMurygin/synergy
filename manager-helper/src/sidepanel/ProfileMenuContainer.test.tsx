import { LayoutModeProvider } from '@synergy/ui-kit'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/shared/auth'
import { WrongPasswordError } from '@/shared/auth/auth-api'
import { useAuthSession } from '@/shared/auth/use-auth-session'
import type { TelegramLink, TelegramLinkState } from '@/options/telegram/use-telegram-link'
import { linkedState, makeLink } from './telegram/link-fixtures.testing'
import { ProfileMenuContainer } from './ProfileMenuContainer'

vi.mock('@/shared/auth/use-auth-session')

let session: AuthSession

beforeEach(() => {
  session = {
    status: 'authenticated',
    user: { id: '1', login: 'manager1' },
    notice: null,
    login: vi.fn(),
    changePassword: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
    retry: vi.fn(),
  }
  vi.mocked(useAuthSession).mockReturnValue(session)
})

function setup(state: TelegramLinkState = { kind: 'idle' }) {
  const link: TelegramLink = makeLink(state)
  const onOpenTelegram = vi.fn()
  render(
    <LayoutModeProvider mode="tablet">
      <ProfileMenuContainer link={link} onOpenTelegram={onOpenTelegram} />
    </LayoutModeProvider>,
  )
  return { onOpenTelegram }
}

const open = () => userEvent.click(screen.getByRole('button', { name: /Профиль/ }))

describe('ProfileMenuContainer', () => {
  it('shows the login and the telegram status', async () => {
    setup(linkedState())
    await open()
    expect(await screen.findByText(/manager1 · Вы вошли/)).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Telegram/ }).textContent).toContain('@ivanov_tg')
  })

  it('shows "Не подключён" while telegram is not linked', async () => {
    setup()
    await open()
    expect(
      (await screen.findByRole('menuitem', { name: /Telegram/ })).textContent,
    ).toContain('Не подключён')
  })

  it.each<TelegramLinkState>([{ kind: 'not-configured' }, { kind: 'unavailable' }])(
    'has no telegram item when the bot is not configured (%o)',
    async (state) => {
      setup(state)
      await open()
      await screen.findByRole('menuitem', { name: /Выйти/ })
      expect(screen.queryByRole('menuitem', { name: /Telegram/ })).toBeNull()
    },
  )

  it('opens the telegram pane', async () => {
    const { onOpenTelegram } = setup()
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Telegram/ }))
    expect(onOpenTelegram).toHaveBeenCalledTimes(1)
  })

  it('logs out only after the confirmation', async () => {
    setup()
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Выйти/ }))
    expect(session.logout).not.toHaveBeenCalled()
    await screen.findByRole('dialog', { name: 'Выйти из аккаунта?' })
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(session.logout).toHaveBeenCalledTimes(1)
  })

  it('changes the password through the package dialog and closes it', async () => {
    setup()
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Сменить пароль/ }))
    await userEvent.type(await screen.findByLabelText('Текущий пароль'), 'old-pass-1')
    await userEvent.type(screen.getByLabelText('Новый пароль'), 'brand-new-2')
    await userEvent.type(screen.getByLabelText('Повторите новый пароль'), 'brand-new-2')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }))
    expect(session.changePassword).toHaveBeenCalledWith('old-pass-1', 'brand-new-2')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('shows the server error and keeps the dialog open', async () => {
    session.changePassword = vi
      .fn()
      .mockRejectedValue(new WrongPasswordError('x', 401, 'WRONG_PASSWORD'))
    setup()
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Сменить пароль/ }))
    await userEvent.type(await screen.findByLabelText('Текущий пароль'), 'old-pass-1')
    await userEvent.type(screen.getByLabelText('Новый пароль'), 'brand-new-2')
    await userEvent.type(screen.getByLabelText('Повторите новый пароль'), 'brand-new-2')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Неверный текущий пароль')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

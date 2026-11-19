import '@/features/tasks/test-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as telegramApi from '@/lib/backend/telegram.api'
import { createTelegramWrapper, linkedStatus, unavailableStatus, unlinkedStatus } from '@/features/telegram/test-utils'
import { authenticatedSnapshot, installBridgeMock } from './auth-test-utils'
import { ProfileMenuContainer } from './ProfileMenuContainer'
import { useSessionStore } from './session.store'

vi.mock('@/lib/backend/telegram.api')

let bridge: ReturnType<typeof installBridgeMock>

beforeEach(() => {
  vi.resetAllMocks()
  bridge = installBridgeMock(authenticatedSnapshot)
  useSessionStore.setState({ snapshot: authenticatedSnapshot })
})

afterEach(cleanup)

function mount() {
  render(<ProfileMenuContainer />, { wrapper: createTelegramWrapper() })
  return userEvent.setup()
}

const avatar = () => screen.getByRole('button', { name: 'Профиль: admin' })

describe('ProfileMenuContainer', () => {
  it('shows the login in the menu card', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    const user = mount()
    await user.click(avatar())
    expect(screen.getByText(/Вы вошли в систему/)).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeTruthy()
  })

  it('renders nothing without a session', () => {
    useSessionStore.setState({ snapshot: { state: 'unauthenticated', user: null } })
    const { container } = render(<ProfileMenuContainer />, { wrapper: createTelegramWrapper() })
    expect(container.querySelector('button')).toBeNull()
  })

  it('asks for confirmation before the logout', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    bridge.logout.mockResolvedValue({ serverRevoked: true })
    const user = mount()
    await user.click(avatar())
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }))
    expect(bridge.logout).not.toHaveBeenCalled()
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Выйти' }))
    await waitFor(() => { expect(bridge.logout).toHaveBeenCalledTimes(1); })
  })

  it('keeps the session when the logout is cancelled', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    const user = mount()
    await user.click(avatar())
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отмена' }))
    expect(bridge.logout).not.toHaveBeenCalled()
  })

  it('has the Telegram item with «Не подключён» that opens the Telegram dialog', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    const user = mount()
    await waitFor(() => { expect(telegramApi.getTelegramLink).toHaveBeenCalled(); })
    await user.click(avatar())
    const item = await screen.findByRole('menuitem', { name: /Telegram/ })
    expect(item.textContent).toContain('Не подключён')
    await user.click(item)
    expect(await screen.findByRole('dialog', { name: 'Telegram' })).toBeTruthy()
  })

  it('shows the linked @username in the Telegram item', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linkedStatus)
    const user = mount()
    await waitFor(() => { expect(telegramApi.getTelegramLink).toHaveBeenCalled(); })
    await user.click(avatar())
    expect((await screen.findByRole('menuitem', { name: /Telegram/ })).textContent).toContain('@ivanov_tg')
  })

  it('has no Telegram item when the bot is not configured', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unavailableStatus)
    const user = mount()
    await waitFor(() => { expect(telegramApi.getTelegramLink).toHaveBeenCalled(); })
    await user.click(avatar())
    expect(screen.getByText(/Вы вошли в систему/)).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Telegram/ })).toBeNull()
  })

  it('changes the password from the menu and closes the dialog on success', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    bridge.changePassword.mockResolvedValue({ ok: true, snapshot: authenticatedSnapshot })
    const user = mount()
    await user.click(avatar())
    await user.click(screen.getByRole('menuitem', { name: 'Сменить пароль' }))
    const dialog = await screen.findByRole('dialog', { name: 'Смена пароля' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), 'OldPass12345')
    await user.type(within(dialog).getByLabelText('Новый пароль'), 'NewPass12345')
    await user.type(within(dialog).getByLabelText('Повторите новый пароль'), 'NewPass12345')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить пароль' }))
    await waitFor(() => { expect(bridge.changePassword).toHaveBeenCalledWith('OldPass12345', 'NewPass12345'); })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); })
  })

  it('shows the server error in the change password dialog', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    bridge.changePassword.mockResolvedValue({ ok: false, code: 'WRONG_PASSWORD' })
    const user = mount()
    await user.click(avatar())
    await user.click(screen.getByRole('menuitem', { name: 'Сменить пароль' }))
    const dialog = await screen.findByRole('dialog', { name: 'Смена пароля' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), 'OldPass12345')
    await user.type(within(dialog).getByLabelText('Новый пароль'), 'NewPass12345')
    await user.type(within(dialog).getByLabelText('Повторите новый пароль'), 'NewPass12345')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить пароль' }))
    expect(await within(dialog).findByText('Неверный текущий пароль')).toBeTruthy()
  })
})

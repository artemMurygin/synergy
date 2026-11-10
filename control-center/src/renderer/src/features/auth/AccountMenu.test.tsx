import '@/features/tasks/test-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as telegramApi from '@/lib/backend/telegram.api'
import { createTelegramWrapper, linkedStatus, unavailableStatus, unlinkedStatus } from '@/features/telegram/test-utils'
import { AccountMenu } from './AccountMenu'
import { authenticatedSnapshot } from './auth-test-utils'
import { useSessionStore } from './session.store'

vi.mock('@/lib/backend/telegram.api')

beforeEach(() => {
  vi.resetAllMocks()
  useSessionStore.setState({ snapshot: authenticatedSnapshot })
})

afterEach(cleanup)

function mount() {
  render(<AccountMenu />, { wrapper: createTelegramWrapper() })
  return userEvent.setup()
}

const avatar = () => screen.getByRole('button', { name: 'Учётная запись admin' })

describe('AccountMenu', () => {
  it('shows the login and logout in the account card', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    const user = mount()
    await user.click(avatar())
    expect(screen.getByText('Вы вошли в систему')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeTruthy()
  })

  it('has the Telegram item with «Не подключён» that opens the Telegram dialog', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    const user = mount()
    await waitFor(() => expect(telegramApi.getTelegramLink).toHaveBeenCalled())
    await user.click(avatar())
    const item = await screen.findByRole('button', { name: /Telegram/ })
    expect(item.textContent).toContain('Не подключён')
    await user.click(item)
    expect(await screen.findByRole('dialog', { name: 'Telegram' })).toBeTruthy()
    expect(screen.queryByText('Вы вошли в систему')).toBeNull()
  })

  it('shows the linked @username in the Telegram item', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linkedStatus)
    const user = mount()
    await user.click(avatar())
    expect((await screen.findByRole('button', { name: /Telegram/ })).textContent).toContain('@ivanov_tg')
  })

  it('has no Telegram item when the bot is not configured', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unavailableStatus)
    const user = mount()
    await waitFor(() => expect(telegramApi.getTelegramLink).toHaveBeenCalled())
    await user.click(avatar())
    expect(screen.getByText('Вы вошли в систему')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Telegram/ })).toBeNull()
  })
})

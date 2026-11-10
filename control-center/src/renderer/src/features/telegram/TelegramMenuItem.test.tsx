import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as telegramApi from '@/lib/backend/telegram.api'
import { TelegramMenuItem } from './TelegramMenuItem'
import { createTelegramWrapper, linkedStatus, unavailableStatus, unlinkedStatus } from './test-utils'

vi.mock('@/lib/backend/telegram.api')

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
})

function mount() {
  const onOpen = vi.fn()
  render(<TelegramMenuItem onOpen={onOpen} />, { wrapper: createTelegramWrapper() })
  return { onOpen, user: userEvent.setup() }
}

describe('TelegramMenuItem', () => {
  it('shows «Не подключён» without a link', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    mount()
    const item = await screen.findByRole('button', { name: /Telegram/ })
    expect(item.textContent).toContain('Не подключён')
  })

  it('shows the linked @username', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linkedStatus)
    mount()
    const item = await screen.findByRole('button', { name: /Telegram/ })
    expect(item.textContent).toContain('@ivanov_tg')
    expect(item.textContent).not.toContain('Не подключён')
  })

  it('says «Подключён» when the linked account has no username', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue({ ...linkedStatus, username: null })
    mount()
    const item = await screen.findByRole('button', { name: /Telegram/ })
    expect(item.textContent).toContain('Подключён')
  })

  it('is hidden while the status is loading', () => {
    vi.mocked(telegramApi.getTelegramLink).mockReturnValue(new Promise(() => {}))
    mount()
    expect(screen.queryByRole('button', { name: /Telegram/ })).toBeNull()
  })

  it('is hidden when the bot is not configured on the server', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unavailableStatus)
    mount()
    await waitFor(() => expect(telegramApi.getTelegramLink).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('button', { name: /Telegram/ })).toBeNull()
  })

  it('opens the Telegram section on click', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    const { onOpen, user } = mount()
    await user.click(await screen.findByRole('button', { name: /Telegram/ }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})

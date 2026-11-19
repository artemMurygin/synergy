/* eslint-disable @typescript-eslint/require-await -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
import '@/features/tasks/test-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramNotConfiguredError } from '@/lib/backend/errors'
import * as telegramApi from '@/lib/backend/telegram.api'
import { TelegramDialog } from './TelegramDialog'
import { createTelegramWrapper, linkedStatus, TELEGRAM_LINK_URL, unavailableStatus, unlinkedStatus } from './test-utils'

vi.mock('@/lib/backend/telegram.api')

const LINK_LIFETIME_MS = 600_000

let openSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  openSpy = vi.fn(() => null)
  vi.stubGlobal('open', openSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mount(open = true) {
  const onOpenChange = vi.fn()
  const view = render(<TelegramDialog open={open} onOpenChange={onOpenChange} />, {
    wrapper: createTelegramWrapper()
  })
  return {
    onOpenChange,
    user: userEvent.setup(),
    setOpen: (next: boolean) => { view.rerender(<TelegramDialog open={next} onOpenChange={onOpenChange} />); }
  }
}

const issuedToken = () => ({ url: TELEGRAM_LINK_URL, expiresAt: new Date(Date.now() + LINK_LIFETIME_MS).toISOString() })

describe('TelegramDialog', () => {
  it('is a dialog named «Telegram»', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    mount()
    expect(await screen.findByRole('dialog', { name: 'Telegram' })).toBeTruthy()
  })

  it('renders nothing while closed', () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    mount(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the connect panel without a link', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    mount()
    expect(await screen.findByRole('heading', { name: 'Подключите Telegram' })).toBeTruthy()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Подключить' })).toHaveProperty('disabled', false); })
  })

  it('shows the linked panel with a link', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linkedStatus)
    mount()
    expect(await screen.findByText('@ivanov_tg')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Уведомления в Telegram' })).toBeTruthy()
  })

  it('shows the not-configured panel when the status says the bot is unavailable', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unavailableStatus)
    mount()
    expect(await screen.findByRole('heading', { name: 'Telegram-бот не настроен' })).toBeTruthy()
  })

  it('issues the link, opens it and waits for the confirmation', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(issuedToken())
    const { user } = mount()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Подключить' })).toHaveProperty('disabled', false); })
    await user.click(screen.getByRole('button', { name: 'Подключить' }))
    expect(await screen.findByText('Ждём подтверждения в Telegram')).toBeTruthy()
    expect(openSpy).toHaveBeenCalledWith(TELEGRAM_LINK_URL, '_blank', 'noopener,noreferrer')
    expect(screen.getByText(/@synergy_tasks_bot/)).toBeTruthy()
    expect(screen.getByText(/^Ссылка действует ещё \d+:\d{2}$/)).toBeTruthy()
  })

  it('shows the not-configured panel when issuing answers TELEGRAM_NOT_CONFIGURED and closes from it', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockRejectedValue(new TelegramNotConfiguredError('Бот не настроен'))
    const { user, onOpenChange } = mount()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Подключить' })).toHaveProperty('disabled', false); })
    await user.click(screen.getByRole('button', { name: 'Подключить' }))
    expect(await screen.findByRole('heading', { name: 'Telegram-бот не настроен' })).toBeTruthy()
    await user.click(screen.getByText('Закрыть'))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('cancels the waiting when the dialog is closed', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(issuedToken())
    const { user, onOpenChange, setOpen } = mount()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Подключить' })).toHaveProperty('disabled', false); })
    await user.click(screen.getByRole('button', { name: 'Подключить' }))
    await screen.findByText('Ждём подтверждения в Telegram')
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    setOpen(false)
    setOpen(true)
    expect(await screen.findByRole('heading', { name: 'Подключите Telegram' })).toBeTruthy()
  })

  it('closes on «Готово» in the linked panel', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linkedStatus)
    const { user, onOpenChange } = mount()
    await user.click(await screen.findByRole('button', { name: 'Готово' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('returns to the connect panel after a confirmed unlink', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linkedStatus)
    vi.mocked(telegramApi.unlinkTelegram).mockImplementation(async () => {
      vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
    })
    const { user } = mount()
    await user.click(await screen.findByRole('button', { name: 'Отключить Telegram' }))
    await user.click(screen.getByRole('button', { name: 'Отключить' }))
    expect(await screen.findByRole('heading', { name: 'Подключите Telegram' })).toBeTruthy()
    expect(telegramApi.unlinkTelegram).toHaveBeenCalledOnce()
    await waitFor(() => { expect(screen.queryByRole('alertdialog')).toBeNull(); })
  })

  it('rolls the switch back and shows the error when the server rejects the toggle', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linkedStatus)
    vi.mocked(telegramApi.setTelegramNotifications).mockRejectedValue(new Error('Ошибка сервера'))
    const { user } = mount()
    const control = await screen.findByRole('switch', { name: 'Уведомления в Telegram' })
    await user.click(control)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Уведомления в Telegram' }).getAttribute('aria-checked')).toBe('true')
  })
})

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramConnectPanel, type TelegramConnectPanelState } from './TelegramConnectPanel'

afterEach(cleanup)

interface SetupOptions {
  state: TelegramConnectPanelState
  botUsername?: string | null
  remainingMs?: number
  errorMessage?: string | null
}

function setup({ state, botUsername = null, remainingMs = 0, errorMessage = null }: SetupOptions) {
  const handlers = { onConnect: vi.fn(), onReopenLink: vi.fn(), onCancel: vi.fn(), onClose: vi.fn() }
  render(
    <TelegramConnectPanel
      state={state}
      botUsername={botUsername}
      remainingMs={remainingMs}
      errorMessage={errorMessage}
      {...handlers}
    />
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('TelegramConnectPanel', () => {
  it('offers «Подключить» without a link and does not name the bot yet', async () => {
    const { user, onConnect } = setup({ state: 'idle' })
    expect(screen.getByRole('heading', { name: 'Подключите Telegram' })).toBeTruthy()
    expect(screen.getByText(/в чат с ботом\./).textContent).not.toContain('@')
    await user.click(screen.getByRole('button', { name: 'Подключить' }))
    expect(onConnect).toHaveBeenCalledOnce()
  })

  it('blocks the button while the link is being issued', () => {
    setup({ state: 'issuing' })
    const button = screen.getByRole('button', { name: 'Получаем ссылку…' })
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })

  it('blocks the button while the status is loading', () => {
    setup({ state: 'loading' })
    expect(screen.getByRole('button', { name: 'Подключить' })).toHaveProperty('disabled', true)
  })

  it('waits with a countdown, names the bot and offers to reopen the link or cancel', async () => {
    const { user, onReopenLink, onCancel, onConnect } = setup({
      state: 'waiting',
      botUsername: 'synergy_tasks_bot',
      remainingMs: 580_200
    })
    expect(screen.getByRole('heading', { name: 'Ждём подтверждения в Telegram' })).toBeTruthy()
    expect(screen.getByText(/Откройте чат с @synergy_tasks_bot/)).toBeTruthy()
    expect(screen.getByText('Ссылка действует ещё 9:41')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Открыть ссылку ещё раз' }))
    expect(onReopenLink).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('pads the seconds of the countdown', () => {
    setup({ state: 'waiting', botUsername: 'synergy_tasks_bot', remainingMs: 65_000 })
    expect(screen.getByText('Ссылка действует ещё 1:05')).toBeTruthy()
  })

  it('falls back to «с ботом» when the bot name is unknown while waiting', () => {
    setup({ state: 'waiting', botUsername: null, remainingMs: 10_000 })
    expect(screen.getByText(/Откройте чат с ботом и нажмите/)).toBeTruthy()
  })

  it('says the link expired and offers a new one', async () => {
    const { user, onConnect, onCancel } = setup({ state: 'expired' })
    expect(screen.getByRole('heading', { name: 'Ссылка устарела' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Получить новую' }))
    expect(onConnect).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows an issuing error with the server message and a retry', async () => {
    const { user, onConnect } = setup({ state: 'error', errorMessage: 'Нет связи с сервером' })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Не удалось получить ссылку')
    expect(alert.textContent).toContain('Нет связи с сервером')
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onConnect).toHaveBeenCalledOnce()
  })

  it('says the bot is not configured and only offers to close', async () => {
    const { user, onClose } = setup({ state: 'not-configured' })
    expect(screen.getByRole('heading', { name: 'Telegram-бот не настроен' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

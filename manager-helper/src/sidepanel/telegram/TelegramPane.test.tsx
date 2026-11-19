import { LayoutModeProvider, type LayoutMode } from '@synergy/ui-kit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TelegramLink } from '@/options/telegram/use-telegram-link'
import { linkedState, makeLink } from './link-fixtures.testing'
import { TelegramPane } from './TelegramPane'

function setup(link: TelegramLink, mode: LayoutMode = 'tablet') {
  const onOpenChange = vi.fn()
  render(
    <LayoutModeProvider mode={mode}>
      <TelegramPane open onOpenChange={onOpenChange} link={link} />
    </LayoutModeProvider>,
  )
  return { onOpenChange }
}

describe('TelegramPane', () => {
  it('opens as a centered dialog on tablet', () => {
    setup(makeLink({ kind: 'idle' }))
    expect(screen.getByRole('dialog').getAttribute('data-side')).toBeNull()
  })

  it('shows the bottom sheet on mobile', () => {
    setup(makeLink({ kind: 'idle' }), 'mobile')
    expect(screen.getByRole('dialog').getAttribute('data-side')).toBe('bottom')
  })

  it('starts the connection from the idle state', async () => {
    const link = makeLink({ kind: 'idle' })
    setup(link)
    await userEvent.click(screen.getByRole('button', { name: 'Подключить' }))
    expect(link.connect).toHaveBeenCalledTimes(1)
  })

  it('shows the error of the failed link request', () => {
    setup(makeLink({ kind: 'error', message: 'Сервер недоступен' }))
    expect(screen.getByRole('alert').textContent).toContain('Сервер недоступен')
  })

  it('shows the waiting state with the countdown and reopens the link', async () => {
    const link = makeLink(
      { kind: 'waiting', url: 'https://t.me/bot?start=1', botUsername: 'synergy_bot', expiresAt: 'x' },
      125_000,
    )
    setup(link)
    expect(screen.getByText(/@synergy_bot/)).toBeTruthy()
    expect(screen.getByText(/2:05/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Открыть ссылку ещё раз/ }))
    expect(link.reopenLink).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(link.cancel).toHaveBeenCalledTimes(1)
  })

  it('renews an expired link', async () => {
    const link = makeLink({ kind: 'expired' })
    setup(link)
    await userEvent.click(screen.getByRole('button', { name: 'Получить новую' }))
    expect(link.connect).toHaveBeenCalledTimes(1)
  })

  it('shows the linked account and switches the notifications', async () => {
    const link = makeLink(linkedState())
    setup(link)
    expect(screen.getByText('@ivanov_tg')).toBeTruthy()
    await userEvent.click(screen.getByRole('switch', { name: 'Уведомления в Telegram' }))
    expect(link.toggleNotifications).toHaveBeenCalledWith(false)
  })

  it('shows the toggle error of the linked state', () => {
    setup(makeLink(linkedState({ toggleError: 'Сервер не принял' })))
    expect(screen.getByRole('alert').textContent).toContain('Сервер не принял')
  })

  it('confirms the unlink before calling it', async () => {
    const link = makeLink(linkedState())
    setup(link)
    await userEvent.click(screen.getByRole('button', { name: /Отключить Telegram/ }))
    expect(link.unlink).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Отключить Telegram?' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Отключить' }))
    expect(link.unlink).toHaveBeenCalledTimes(1)
  })

  it('goes back from the unlink confirmation', async () => {
    const link = makeLink(linkedState())
    setup(link)
    await userEvent.click(screen.getByRole('button', { name: /Отключить Telegram/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.getByText('@ivanov_tg')).toBeTruthy()
    expect(link.unlink).not.toHaveBeenCalled()
  })

  it('retries a failed status load', async () => {
    const link = makeLink({ kind: 'load-error', message: 'Нет связи' })
    setup(link)
    expect(screen.getByRole('alert').textContent).toContain('Нет связи')
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(link.reload).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting for the confirmation when the pane is closed', async () => {
    const link = makeLink({
      kind: 'waiting',
      url: 'https://t.me/bot?start=1',
      botUsername: null,
      expiresAt: 'x',
    })
    const { onOpenChange } = setup(link)
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(link.cancel).not.toHaveBeenCalled()
  })
})

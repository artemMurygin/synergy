import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TelegramNotConfiguredPanel } from './TelegramNotConfiguredPanel'

describe('TelegramNotConfiguredPanel', () => {
  it('explains that the bot is not configured and closes', async () => {
    const onClose = vi.fn()
    render(<TelegramNotConfiguredPanel onClose={onClose} />)
    expect(screen.getByText('Telegram-бот не настроен')).toBeTruthy()
    expect(screen.getByText(/Обратитесь к администратору/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('has no close button without onClose', () => {
    render(<TelegramNotConfiguredPanel />)
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull()
  })
})

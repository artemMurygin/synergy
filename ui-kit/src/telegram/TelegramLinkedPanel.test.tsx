import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TelegramLinkedPanel } from './TelegramLinkedPanel'

type Props = Parameters<typeof TelegramLinkedPanel>[0]

function setup(props: Partial<Props> = {}) {
  const handlers = { onToggleNotifications: vi.fn(), onUnlink: vi.fn(), onClose: vi.fn() }
  render(
    <TelegramLinkedPanel
      username="ivanov_tg"
      linkedAt="2026-11-11T12:20:00Z"
      notificationsEnabled
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('TelegramLinkedPanel', () => {
  it('shows the username and the link date', () => {
    setup()
    expect(screen.getByText('@ivanov_tg')).toBeTruthy()
    expect(screen.getByText(/Подключён 11 ноября 2026/)).toBeTruthy()
  })

  it('toggles notifications with the next value', async () => {
    const h = setup()
    const toggle = screen.getByRole('switch', { name: 'Уведомления в Telegram' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await userEvent.click(toggle)
    expect(h.onToggleNotifications).toHaveBeenCalledWith(false)
  })

  it('reflects a disabled state and disables the switch while pending', () => {
    setup({ notificationsEnabled: false, togglePending: true })
    const toggle = screen.getByRole('switch', { name: 'Уведомления в Telegram' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(toggle).toHaveProperty('disabled', true)
  })

  it('shows a toggle error', () => {
    setup({ error: 'Сервер не принял изменение' })
    expect(screen.getByRole('alert').textContent).toContain('Не удалось изменить настройку')
    expect(screen.getByRole('alert').textContent).toContain('Сервер не принял изменение')
  })

  it('requests unlinking and closing', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Отключить Telegram' }))
    expect(h.onUnlink).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(h.onClose).toHaveBeenCalledOnce()
  })
})

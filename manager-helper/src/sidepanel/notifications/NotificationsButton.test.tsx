import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsButton } from './NotificationsButton'

function badge(): HTMLElement | null {
  return document.querySelector('[data-unread-badge]')
}

describe('NotificationsButton', () => {
  it('shows the unread count in the badge and in the accessible name', () => {
    render(<NotificationsButton unreadCount={3} isOpen={false} onClick={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Уведомления: 3 непрочитанных' })).toBeTruthy()
    expect(badge()?.textContent).toBe('3')
  })

  it('shows 99+ for more than 99 unread', () => {
    render(<NotificationsButton unreadCount={120} isOpen={false} onClick={() => undefined} />)
    expect(badge()?.textContent).toBe('99+')
  })

  it('hides the badge when there is nothing unread', () => {
    render(<NotificationsButton unreadCount={0} isOpen={false} onClick={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Уведомления' })).toBeTruthy()
    expect(badge()).toBeNull()
  })

  it('reports the open list and calls onClick', () => {
    const onClick = vi.fn()
    render(<NotificationsButton unreadCount={1} isOpen onClick={onClick} />)
    const button = screen.getByRole('button', { name: /Уведомления/ })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

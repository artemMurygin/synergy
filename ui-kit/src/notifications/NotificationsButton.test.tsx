import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsButton } from './NotificationsButton'

describe('NotificationsButton', () => {
  it('hides the badge for 0', () => {
    render(<NotificationsButton count={0} />)
    expect(screen.getByRole('button', { name: 'Уведомления' })).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows the count and mentions it in the accessible name', () => {
    render(<NotificationsButton count={3} />)
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Уведомления, непрочитанных: 3' })).toBeTruthy()
  })

  it('shows 99+ for 150', () => {
    render(<NotificationsButton count={150} />)
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('reflects the open state and handles clicks', async () => {
    const onClick = vi.fn()
    render(<NotificationsButton count={1} open onClick={onClick} />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

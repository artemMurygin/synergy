import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationItem } from './NotificationItem'
import { makeNotification } from './test-utils'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T10:02:00.000Z'))
})

describe('NotificationItem', () => {
  it('shows the title, the text and the relative time', () => {
    render(<NotificationItem notification={makeNotification('1')} onOpen={() => {}} />)
    const row = screen.getByRole('button', { name: /Уведомление 1/ })
    expect(row.textContent).toContain('Уведомление 1')
    expect(row.textContent).toContain('Текст')
    expect(row.textContent).toContain('2 мин назад')
  })

  it('marks an unread notification', () => {
    render(<NotificationItem notification={makeNotification('1')} onOpen={() => {}} />)
    const row = screen.getByRole('button', { name: /Уведомление 1/ })
    expect(row.getAttribute('data-unread')).toBe('true')
    expect(screen.getByLabelText('Не прочитано')).toBeTruthy()
  })

  it('does not mark a read notification', () => {
    render(<NotificationItem notification={makeNotification('1', '2026-11-10T10:01:00.000Z')} onOpen={() => {}} />)
    const row = screen.getByRole('button', { name: /Уведомление 1/ })
    expect(row.getAttribute('data-unread')).toBe('false')
    expect(screen.queryByLabelText('Не прочитано')).toBeNull()
  })

  it('calls onOpen with the notification on click', async () => {
    const onOpen = vi.fn()
    const notification = makeNotification('1')
    render(<NotificationItem notification={notification} onOpen={onOpen} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Уведомление 1/ }))
    expect(onOpen).toHaveBeenCalledWith(notification)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeNotification } from '@/background/notifications/chrome-fake.testing'
import { NotificationItem } from './NotificationItem'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const UNREAD = makeNotification('n1', '2026-11-10T11:58:00.000Z', {
  title: 'Вам назначена задача',
  body: 'ivanov назначил вас ответственным: Подготовить КП',
})
const READ = { ...UNREAD, id: 'n2', readAt: '2026-11-10T11:59:00.000Z' }

describe('NotificationItem', () => {
  it('shows the title, the text and the short relative time', () => {
    render(<NotificationItem notification={UNREAD} now={NOW} timeMode="short" onOpen={vi.fn()} />)
    expect(screen.getByText('Вам назначена задача')).toBeTruthy()
    expect(screen.getByText('ivanov назначил вас ответственным: Подготовить КП')).toBeTruthy()
    expect(screen.getByText('2 мин')).toBeTruthy()
  })

  it('uses the full relative time when asked', () => {
    render(<NotificationItem notification={UNREAD} now={NOW} timeMode="full" onOpen={vi.fn()} />)
    expect(screen.getByText('2 мин назад')).toBeTruthy()
  })

  it('marks an unread notification', () => {
    render(<NotificationItem notification={UNREAD} now={NOW} timeMode="short" onOpen={vi.fn()} />)
    const row = screen.getByRole('button', { name: /Вам назначена задача/ })
    expect(row.getAttribute('data-unread')).toBe('true')
    expect(screen.getByText('Не прочитано')).toBeTruthy()
  })

  it('does not mark a read notification', () => {
    render(<NotificationItem notification={READ} now={NOW} timeMode="short" onOpen={vi.fn()} />)
    const row = screen.getByRole('button', { name: /Вам назначена задача/ })
    expect(row.getAttribute('data-unread')).toBe('false')
    expect(screen.queryByText('Не прочитано')).toBeNull()
  })

  it('opens the notification on click', () => {
    const onOpen = vi.fn()
    render(<NotificationItem notification={UNREAD} now={NOW} timeMode="short" onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /Вам назначена задача/ }))
    expect(onOpen).toHaveBeenCalledWith(UNREAD)
  })
})

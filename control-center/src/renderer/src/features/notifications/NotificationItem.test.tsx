import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlertCircle, Bell, FileAudio, ListChecks } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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

  describe('icon by type', () => {
    const iconClass = (Icon: LucideIcon): string => {
      const { container, unmount } = render(<Icon />)
      const value = container.querySelector('svg')?.getAttribute('class') ?? ''
      unmount()
      return value.split(' ').find((name) => name.startsWith('lucide-') && name !== 'lucide-icon') ?? ''
    }
    const shown = (type: string, target: { type: string; id: string }): string => {
      const { container } = render(
        <NotificationItem notification={{ ...makeNotification('1'), type, target }} onOpen={() => {}} />
      )
      return container.querySelector('svg')?.getAttribute('class') ?? ''
    }

    it.each([
      ['meeting-transcript.ready', { type: 'chat', id: 'c1' }, FileAudio],
      ['meeting-transcript.failed', { type: 'chat', id: 'c1' }, AlertCircle],
      ['task.assigned', { type: 'task', id: 't1' }, ListChecks],
      ['task.created-on-behalf', { type: 'task', id: 't1' }, ListChecks],
      ['something.else', { type: 'deal', id: 'd1' }, Bell]
    ])('%s', (type, target, Icon) => {
      const expected = iconClass(Icon)
      expect(expected).not.toBe('')
      expect(shown(type, target).split(' ')).toContain(expected)
    })
  })
})

import { describe, expect, it } from 'vitest'
import { groupOf, toNotificationView } from './notification-view'
import { makeNotification } from './test-utils'

const NOW = new Date('2026-11-10T10:02:00.000Z')

describe('toNotificationView', () => {
  it('maps title, text, relative time and the unread flag', () => {
    const view = toNotificationView(makeNotification('1'), NOW)
    expect(view).toMatchObject({ id: '1', title: 'Уведомление 1', text: 'Текст', time: '2 мин назад', unread: true })
  })

  it('marks a read notification as not unread', () => {
    expect(toNotificationView(makeNotification('1', '2026-11-10T10:01:00.000Z'), NOW).unread).toBe(false)
  })

  it.each([
    ['meeting-transcript.ready', { type: 'chat', id: 'c1' }, 'info'],
    ['meeting-transcript.failed', { type: 'chat', id: 'c1' }, 'warning'],
    ['task.assigned', { type: 'task', id: 't1' }, 'brand'],
    ['something.else', { type: 'deal', id: 'd1' }, 'brand']
  ])('%s gets the %s tone', (type, target, tone) => {
    expect(toNotificationView({ ...makeNotification('1'), type, target }, NOW).tone).toBe(tone)
  })
})

describe('groupOf', () => {
  it('groups by calendar day', () => {
    expect(groupOf(NOW.toISOString(), NOW)).toBe('Сегодня')
    expect(groupOf(new Date(NOW.getTime() - 86_400_000).toISOString(), NOW)).toBe('Вчера')
    expect(groupOf('2026-10-01T10:00:00.000Z', NOW)).toBe('Ранее')
  })
})

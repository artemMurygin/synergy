import { describe, expect, it } from 'vitest'
import { notificationIcon, notificationIconNode } from '@synergy/ui-kit'
import { toNotificationView } from './notification-view'
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

describe('icons and groups of the package', () => {
  it('maps the type of the notification to the icon name of the package', () => {
    expect(notificationIcon('task')).toBe('list-checks')
    expect(notificationIcon('something.else')).toBe('bell')
  })

  it('groups the view by day', () => {
    expect(toNotificationView(makeNotification('1'), NOW).group).toBe('Сегодня')
  })

  it('gives the failed transcript the alert icon and a task the list icon', () => {
    const failed = toNotificationView({ ...makeNotification('1'), type: 'meeting-transcript.failed', target: { type: 'chat', id: 'c1' } }, NOW)
    const task = toNotificationView(makeNotification('2'), NOW)
    expect(failed.icon).toEqual(notificationIconNode('error'))
    expect(task.icon).toEqual(notificationIconNode('task'))
  })
})

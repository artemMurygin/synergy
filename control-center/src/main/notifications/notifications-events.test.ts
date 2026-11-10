import { describe, expect, it } from 'vitest'
import { ConnectionErrorSchema, parseNotificationEvent } from './notifications-events'

const notification = {
  id: 'n1',
  type: 'task.assigned',
  title: 'Новая задача',
  body: 'anna назначила вам задачу «Отчёт»',
  target: { type: 'task', id: 't1' },
  actorId: 'u2',
  createdAt: '2026-11-10T10:00:00.000Z',
  readAt: null
}

describe('parseNotificationEvent', () => {
  it('parses notification.created', () => {
    expect(parseNotificationEvent('notification.created', { notification, unreadCount: 3 })).toEqual({
      type: 'notification.created',
      notification,
      unreadCount: 3
    })
  })

  it('parses notification.read with ids', () => {
    expect(parseNotificationEvent('notification.read', { notificationIds: ['n1', 'n2'], unreadCount: 1 })).toEqual({
      type: 'notification.read',
      notificationIds: ['n1', 'n2'],
      unreadCount: 1
    })
  })

  it('parses notification.read for all', () => {
    expect(parseNotificationEvent('notification.read', { all: true, unreadCount: 0 })).toEqual({
      type: 'notification.read',
      all: true,
      unreadCount: 0
    })
  })

  it('drops fields outside the contract', () => {
    const parsed = parseNotificationEvent('notification.created', {
      notification: { ...notification, recipientId: 'u1' },
      unreadCount: 1,
      token: 'secret'
    })
    expect(JSON.stringify(parsed)).not.toMatch(/recipientId|secret/)
  })

  it.each([
    ['unknown event name', 'notification.deleted', { unreadCount: 1 }],
    ['payload is not an object', 'notification.created', 'boom'],
    ['negative unread count', 'notification.created', { notification, unreadCount: -1 }],
    ['fractional unread count', 'notification.read', { all: true, unreadCount: 1.5 }],
    ['notification without target', 'notification.created', { notification: { ...notification, target: null }, unreadCount: 1 }],
    ['notification with a bad date', 'notification.created', { notification: { ...notification, createdAt: 'yesterday' }, unreadCount: 1 }],
    ['read without ids or all', 'notification.read', { unreadCount: 1 }],
    ['read with all false', 'notification.read', { all: false, unreadCount: 1 }]
  ])('rejects %s', (_name, eventName, payload) => {
    expect(parseNotificationEvent(eventName, payload)).toBeNull()
  })
})

describe('ConnectionErrorSchema', () => {
  it.each(['token_invalid', 'token_expired', 'password_change_required', 'origin_not_allowed', 'server_error'])(
    'accepts %s',
    (code) => {
      expect(ConnectionErrorSchema.safeParse({ code }).success).toBe(true)
    }
  )

  it('rejects an unknown code', () => {
    expect(ConnectionErrorSchema.safeParse({ code: 'boom' }).success).toBe(false)
  })
})

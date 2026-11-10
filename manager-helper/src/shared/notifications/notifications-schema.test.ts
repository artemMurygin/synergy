import { describe, expect, it } from 'vitest'
import {
  notificationPageSchema,
  notificationSchema,
  parseConnectionErrorCode,
  parseRealtimeEvent,
  unreadCountSchema,
} from './notifications-schema'

const dto = {
  id: 'n1',
  type: 'task.assigned',
  title: 'Новая задача',
  body: 'anna назначила вам задачу «КП»',
  target: { type: 'task', id: 't1' },
  actorId: 'u2',
  createdAt: '2026-11-10T09:00:00.000Z',
  readAt: null,
}

describe('notificationSchema', () => {
  it('accepts a notification DTO', () => {
    expect(notificationSchema.parse(dto)).toEqual(dto)
  })

  it('accepts a read notification without an actor', () => {
    const read = { ...dto, actorId: null, readAt: '2026-11-10T09:05:00.000Z' }
    expect(notificationSchema.parse(read)).toEqual(read)
  })

  it('rejects a notification without a target id', () => {
    expect(notificationSchema.safeParse({ ...dto, target: { type: 'task' } }).success).toBe(false)
  })

  it('rejects a notification with a malformed date', () => {
    expect(notificationSchema.safeParse({ ...dto, createdAt: 'вчера' }).success).toBe(false)
  })
})

describe('notificationPageSchema', () => {
  it('accepts a page of notifications', () => {
    const page = { items: [dto], total: 1, limit: 20, page: 0 }
    expect(notificationPageSchema.parse(page)).toEqual(page)
  })

  it('rejects a page without a total', () => {
    expect(notificationPageSchema.safeParse({ items: [], limit: 20, page: 0 }).success).toBe(false)
  })
})

describe('unreadCountSchema', () => {
  it('accepts a non-negative integer', () => {
    expect(unreadCountSchema.parse({ unreadCount: 3 })).toEqual({ unreadCount: 3 })
  })

  it('rejects a negative count', () => {
    expect(unreadCountSchema.safeParse({ unreadCount: -1 }).success).toBe(false)
  })
})

describe('parseRealtimeEvent', () => {
  it('parses notification.created', () => {
    expect(parseRealtimeEvent('notification.created', { notification: dto, unreadCount: 4 })).toEqual(
      { type: 'notification.created', payload: { notification: dto, unreadCount: 4 } },
    )
  })

  it('parses notification.read with ids', () => {
    expect(
      parseRealtimeEvent('notification.read', { notificationIds: ['n1'], unreadCount: 2 }),
    ).toEqual({ type: 'notification.read', payload: { notificationIds: ['n1'], unreadCount: 2 } })
  })

  it('parses notification.read for all notifications', () => {
    expect(parseRealtimeEvent('notification.read', { all: true, unreadCount: 0 })).toEqual({
      type: 'notification.read',
      payload: { all: true, unreadCount: 0 },
    })
  })

  it('returns null for a malformed payload', () => {
    expect(parseRealtimeEvent('notification.created', { notification: {}, unreadCount: 1 })).toBe(
      null,
    )
    expect(parseRealtimeEvent('notification.read', { unreadCount: 1 })).toBe(null)
  })

  it('returns null for an unknown event', () => {
    expect(parseRealtimeEvent('notification.deleted', { id: 'n1' })).toBe(null)
  })
})

describe('parseConnectionErrorCode', () => {
  it('reads a known code', () => {
    expect(parseConnectionErrorCode({ code: 'token_expired' })).toBe('token_expired')
    expect(parseConnectionErrorCode({ code: 'password_change_required' })).toBe(
      'password_change_required',
    )
    expect(parseConnectionErrorCode({ code: 'server_error' })).toBe('server_error')
  })

  it('returns null for an unknown payload', () => {
    expect(parseConnectionErrorCode({ code: 'boom' })).toBe(null)
    expect(parseConnectionErrorCode('token_expired')).toBe(null)
  })
})

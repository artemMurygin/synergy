import { describe, expect, it } from 'vitest'
import {
  NOTIFICATIONS_PORT_NAME,
  connectionStateMessage,
  eventMessage,
  isPanelMessage,
} from './panel-protocol'

const dto = {
  id: 'n1',
  type: 'task.assigned',
  title: 'Новая задача',
  body: '',
  target: { type: 'task', id: 't1' },
  actorId: null,
  createdAt: '2026-11-10T09:00:00.000Z',
  readAt: null,
}

describe('panel-protocol', () => {
  it('names the port', () => {
    expect(NOTIFICATIONS_PORT_NAME).toBe('notifications')
  })

  it('accepts an event message built by the helper', () => {
    const message = eventMessage({
      type: 'notification.created',
      payload: { notification: dto, unreadCount: 1 },
    })
    expect(isPanelMessage(message)).toBe(true)
  })

  it('accepts a connection state message built by the helper', () => {
    expect(isPanelMessage(connectionStateMessage('online'))).toBe(true)
    expect(isPanelMessage(connectionStateMessage('connecting'))).toBe(true)
    expect(isPanelMessage(connectionStateMessage('offline'))).toBe(true)
  })

  it('rejects an unknown connection state', () => {
    expect(isPanelMessage({ kind: 'connection-state', state: 'sleeping' })).toBe(false)
  })

  it('rejects an event with a malformed payload', () => {
    expect(
      isPanelMessage({
        kind: 'event',
        event: { type: 'notification.created', payload: { unreadCount: 1 } },
      }),
    ).toBe(false)
  })

  it('rejects foreign messages', () => {
    expect(isPanelMessage(null)).toBe(false)
    expect(isPanelMessage({ type: 'PING' })).toBe(false)
    expect(isPanelMessage('online')).toBe(false)
  })
})

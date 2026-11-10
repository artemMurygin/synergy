import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationPage } from '@/shared/notifications/notifications-schema'
import { installChromeFake, makeNotification } from './chrome-fake.testing'
import type { ChromeFake } from './chrome-fake.testing'
import { syncMissedNotifications } from './missed-notifications'
import { createSeenStore } from './seen-store'
import { SUMMARY_NOTIFICATION_ID, createSystemNotifier } from './system-notifier'

let chromeFake: ChromeFake

function pageOf(
  items: ReturnType<typeof makeNotification>[],
  total = items.length,
): NotificationPage {
  return { items, total, limit: 50, page: 0 }
}

function at(minute: number): string {
  return `2026-11-10T09:${String(minute).padStart(2, '0')}:00.000Z`
}

function setup(page: NotificationPage) {
  const seen = createSeenStore(() => 'u1')
  const notifier = createSystemNotifier({
    isPanelOpen: () => false,
    seen,
    markRead: () => Promise.resolve(0),
  })
  const listUnread = vi.fn(() => Promise.resolve(page))
  return { seen, sync: () => syncMissedNotifications({ listUnread, seen, notifier }) }
}

beforeEach(() => {
  chromeFake = installChromeFake()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('missed-notifications', () => {
  it('shows nothing when there are no unread notifications', async () => {
    const { sync } = setup(pageOf([]))
    expect(await sync()).toBe(0)
    expect(chromeFake.notifications.create).not.toHaveBeenCalled()
  })

  it('shows each of one to three missed notifications', async () => {
    const { sync } = setup(pageOf([makeNotification('n2', at(2)), makeNotification('n1', at(1))]))
    expect(await sync()).toBe(2)
    expect(chromeFake.notifications.create.mock.calls.map((call) => call[0])).toEqual(['n1', 'n2'])
  })

  it('shows one summary for more than three missed notifications', async () => {
    const items = [7, 6, 5, 4, 3, 2, 1].map((minute) =>
      makeNotification(`n${String(minute)}`, at(minute)),
    )
    const { sync } = setup(pageOf(items))
    expect(await sync()).toBe(7)
    expect(chromeFake.notifications.create).toHaveBeenCalledTimes(1)
    expect(chromeFake.notifications.create).toHaveBeenCalledWith(
      SUMMARY_NOTIFICATION_ID,
      expect.objectContaining({ message: 'У вас 7 новых уведомлений' }),
    )
  })

  it('counts unread notifications beyond the fetched page in the summary', async () => {
    const items = [5, 4, 3, 2].map((minute) => makeNotification(`n${String(minute)}`, at(minute)))
    const { sync } = setup(pageOf(items, 60))
    await sync()
    expect(chromeFake.notifications.create).toHaveBeenCalledWith(
      SUMMARY_NOTIFICATION_ID,
      expect.objectContaining({ message: 'У вас 60 новых уведомлений' }),
    )
  })

  it('moves lastSeenCreatedAt to the newest unread notification', async () => {
    const { sync, seen } = setup(
      pageOf([makeNotification('n2', at(2)), makeNotification('n1', at(1))]),
    )
    await sync()
    expect(await seen.getLastSeenCreatedAt()).toBe(at(2))
  })

  it('does not show notifications older than lastSeenCreatedAt', async () => {
    const { sync, seen } = setup(
      pageOf([makeNotification('n3', at(3)), makeNotification('n1', at(1))]),
    )
    await seen.advanceLastSeen(at(2))
    await sync()
    expect(chromeFake.notifications.create.mock.calls.map((call) => call[0])).toEqual(['n3'])
  })

  it('does not repeat notifications that were already shown', async () => {
    const { sync } = setup(pageOf([makeNotification('n2', at(2)), makeNotification('n1', at(1))]))
    await sync()
    chromeFake.notifications.create.mockClear()
    await sync()
    expect(chromeFake.notifications.create).not.toHaveBeenCalled()
  })

  it('does not repeat notifications covered by a summary', async () => {
    const items = [5, 4, 3, 2].map((minute) => makeNotification(`n${String(minute)}`, at(minute)))
    const { sync, seen } = setup(pageOf(items))
    await sync()
    expect(await seen.hasShown('n5')).toBe(true)
    expect(await seen.hasShown('n2')).toBe(true)
  })
})

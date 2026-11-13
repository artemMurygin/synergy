import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { takePendingTarget } from '@/shared/notifications/pending-target'
import { installChromeFake, makeNotification, makeRequestNotification } from './chrome-fake.testing'
import type { ChromeFake } from './chrome-fake.testing'
import { createSeenStore } from './seen-store'
import { SUMMARY_NOTIFICATION_ID, createSystemNotifier } from './system-notifier'

let chromeFake: ChromeFake
let isPanelOpen: boolean

function setup() {
  const markRead = vi.fn<(notificationId: string) => Promise<number>>(() => Promise.resolve(0))
  const seen = createSeenStore(() => 'u1')
  const notifier = createSystemNotifier({ isPanelOpen: () => isPanelOpen, seen, markRead })
  notifier.attach()
  return { notifier, markRead, seen }
}

async function click(notificationId: string) {
  chromeFake.notifications.onClicked.emit(notificationId)
  await vi.waitFor(() => {
    expect(
      chromeFake.sidePanel.open.mock.calls.length + chromeFake.windows.update.mock.calls.length,
    ).toBeGreaterThan(0)
  })
}

beforeEach(() => {
  chromeFake = installChromeFake()
  isPanelOpen = false
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('system-notifier: showing', () => {
  it('creates a system notification with the notification id, title and body', async () => {
    const { notifier } = setup()
    await notifier.showNotification(
      makeNotification('n1', '2026-11-10T09:00:00.000Z', { title: 'Новая задача', body: 'КП' }),
    )
    expect(chromeFake.notifications.create).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ type: 'basic', title: 'Новая задача', message: 'КП' }),
    )
  })

  it('does not show a system notification while the panel is open', async () => {
    isPanelOpen = true
    const { notifier } = setup()
    await notifier.showNotification(makeNotification('n1', '2026-11-10T09:00:00.000Z'))
    expect(chromeFake.notifications.create).not.toHaveBeenCalled()
  })

  it('does not show the same notification twice', async () => {
    const { notifier } = setup()
    const notification = makeNotification('n1', '2026-11-10T09:00:00.000Z')
    await notifier.showNotification(notification)
    await notifier.showNotification(notification)
    expect(chromeFake.notifications.create).toHaveBeenCalledTimes(1)
  })

  it('shows a summary with the count and the right word form', async () => {
    const { notifier } = setup()
    await notifier.showSummary(7)
    expect(chromeFake.notifications.create).toHaveBeenLastCalledWith(
      SUMMARY_NOTIFICATION_ID,
      expect.objectContaining({ message: 'У вас 7 новых уведомлений' }),
    )
    await notifier.showSummary(4)
    expect(chromeFake.notifications.create).toHaveBeenLastCalledWith(
      SUMMARY_NOTIFICATION_ID,
      expect.objectContaining({ message: 'У вас 4 новых уведомления' }),
    )
    await notifier.showSummary(21)
    expect(chromeFake.notifications.create).toHaveBeenLastCalledWith(
      SUMMARY_NOTIFICATION_ID,
      expect.objectContaining({ message: 'У вас 21 новое уведомление' }),
    )
  })

  it('closes the given notifications and all of them', async () => {
    const { notifier } = setup()
    await notifier.showNotification(makeNotification('n1', '2026-11-10T09:00:00.000Z'))
    await notifier.showNotification(makeNotification('n2', '2026-11-10T09:01:00.000Z'))
    await notifier.showSummary(5)
    await notifier.clearNotifications(['n1'])
    expect([...chromeFake.shownNotifications.keys()]).toEqual(['n2', SUMMARY_NOTIFICATION_ID])
    await notifier.closeAll()
    expect(chromeFake.shownNotifications.size).toBe(0)
  })
})

describe('system-notifier: click', () => {
  it('marks the notification read, stores the task target and opens the panel', async () => {
    const { notifier, markRead } = setup()
    await notifier.showNotification(
      makeNotification('n1', '2026-11-10T09:00:00.000Z', { taskId: 't1' }),
    )
    await click('n1')
    expect(markRead).toHaveBeenCalledWith('n1')
    expect(chromeFake.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 })
    expect(chromeFake.windows.update).not.toHaveBeenCalled()
    await vi.waitFor(async () => {
      expect(await takePendingTarget()).toEqual({ kind: 'task', taskId: 't1' })
    })
    expect(chromeFake.shownNotifications.has('n1')).toBe(false)
  })

  it('focuses the window when the panel cannot be opened', async () => {
    chromeFake.sidePanel.open.mockRejectedValue(new Error('user gesture required'))
    const { notifier } = setup()
    await notifier.showNotification(
      makeNotification('n1', '2026-11-10T09:00:00.000Z', { taskId: 't1' }),
    )
    chromeFake.notifications.onClicked.emit('n1')
    await vi.waitFor(() => {
      expect(chromeFake.windows.update).toHaveBeenCalledWith(7, { focused: true })
    })
    expect(await takePendingTarget()).toEqual({ kind: 'task', taskId: 't1' })
  })

  it('opens the panel synchronously inside the click so the user gesture is kept', async () => {
    const { notifier } = setup()
    await notifier.showNotification(
      makeNotification('n1', '2026-11-10T09:00:00.000Z', { taskId: 't1' }),
    )
    chromeFake.notifications.onClicked.emit('n1')
    expect(chromeFake.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 })
    await vi.waitFor(async () => {
      expect(await takePendingTarget()).toEqual({ kind: 'task', taskId: 't1' })
    })
  })

  it('opens the panel in the most recently focused window', async () => {
    const { notifier } = setup()
    await notifier.showNotification(makeNotification('n1', '2026-11-10T09:00:00.000Z'))
    chromeFake.windows.onFocusChanged.emit(12)
    chromeFake.windows.onFocusChanged.emit(chromeFake.windows.WINDOW_ID_NONE)
    chromeFake.notifications.onClicked.emit('n1')
    expect(chromeFake.sidePanel.open).toHaveBeenCalledWith({ windowId: 12 })
  })

  it('opens the panel in the current window when no window is known yet', () => {
    setup()
    chromeFake.notifications.onClicked.emit(SUMMARY_NOTIFICATION_ID)
    expect(chromeFake.sidePanel.open).toHaveBeenCalledWith({
      windowId: chromeFake.windows.WINDOW_ID_CURRENT,
    })
  })

  it('opens the notifications list after a click on the summary', async () => {
    const { notifier, markRead } = setup()
    await notifier.showSummary(7)
    await click(SUMMARY_NOTIFICATION_ID)
    expect(markRead).not.toHaveBeenCalled()
    await vi.waitFor(async () => {
      expect(await takePendingTarget()).toEqual({ kind: 'notifications' })
    })
  })

  it('still opens the panel when marking read fails', async () => {
    const { notifier, markRead } = setup()
    markRead.mockRejectedValue(new Error('offline'))
    await notifier.showNotification(
      makeNotification('n1', '2026-11-10T09:00:00.000Z', { taskId: 't1' }),
    )
    await click('n1')
    expect(chromeFake.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 })
  })
})

describe('system-notifier: request click', () => {
  const PORTAL = 'https://portal.example.com'

  it('opens the request page in a new tab and marks read without opening the panel', async () => {
    chromeFake.storage.sync.store.portalUrl = PORTAL
    const { notifier, markRead } = setup()
    await notifier.showNotification(
      makeRequestNotification('n1', '2026-11-10T09:00:00.000Z', 'req 1'),
    )
    chromeFake.notifications.onClicked.emit('n1')
    await vi.waitFor(() => {
      expect(chromeFake.tabs.create).toHaveBeenCalledWith({
        url: 'https://portal.example.com/requests/req%201',
      })
    })
    expect(markRead).toHaveBeenCalledWith('n1')
    expect(chromeFake.sidePanel.open).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(chromeFake.shownNotifications.has('n1')).toBe(false)
    })
    expect(await takePendingTarget()).toBeNull()
  })

  it('marks read and shows "portal unavailable" in the panel when the portal is not set', async () => {
    const { notifier, markRead } = setup()
    await notifier.showNotification(makeRequestNotification('n1', '2026-11-10T09:00:00.000Z', 'r1'))
    await click('n1')
    expect(markRead).toHaveBeenCalledWith('n1')
    expect(chromeFake.tabs.create).not.toHaveBeenCalled()
    await vi.waitFor(async () => {
      expect(await takePendingTarget()).toEqual({ kind: 'request', requestId: 'r1' })
    })
  })

  it('does not open a tab for an id that cannot form an address of the portal', async () => {
    chromeFake.storage.sync.store.portalUrl = PORTAL
    const { notifier } = setup()
    await notifier.showNotification(makeRequestNotification('n1', '2026-11-10T09:00:00.000Z', '..'))
    await click('n1')
    expect(chromeFake.tabs.create).not.toHaveBeenCalled()
  })

  it('still opens the notifications list for the summary when the portal is set', async () => {
    chromeFake.storage.sync.store.portalUrl = PORTAL
    const { notifier } = setup()
    await notifier.showSummary(3)
    await click(SUMMARY_NOTIFICATION_ID)
    expect(chromeFake.tabs.create).not.toHaveBeenCalled()
    await vi.waitFor(async () => {
      expect(await takePendingTarget()).toEqual({ kind: 'notifications' })
    })
  })
})

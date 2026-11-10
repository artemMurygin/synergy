import { setPendingTarget } from '@/shared/notifications/pending-target'
import type { PendingTarget } from '@/shared/notifications/pending-target'
import type {
  NotificationDto,
  NotificationTarget,
} from '@/shared/notifications/notifications-schema'
import type { SeenStore } from './seen-store'

export const SUMMARY_NOTIFICATION_ID = 'notifications-summary'
const APP_TITLE = 'Manager Helper'
const ICON_PATH = 'public/icons/icon-128.png'

export interface SystemNotifierDeps {
  isPanelOpen: () => boolean
  seen: SeenStore
  markRead: (notificationId: string) => Promise<unknown>
}

export interface SystemNotifier {
  attach(): () => void
  showNotification(notification: NotificationDto): Promise<void>
  showSummary(count: number): Promise<void>
  clearNotifications(notificationIds: readonly string[]): Promise<void>
  closeAll(): Promise<void>
}

function pluralNotifications(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  if (last === 1 && lastTwo !== 11) return 'новое уведомление'
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'новых уведомления'
  return 'новых уведомлений'
}

export function summaryMessage(count: number): string {
  return `У вас ${String(count)} ${pluralNotifications(count)}`
}

function toPendingTarget(target: NotificationTarget | null): PendingTarget {
  return target?.type === 'task' ? { kind: 'task', taskId: target.id } : { kind: 'notifications' }
}

async function focusLastWindow(): Promise<void> {
  const focused = await chrome.windows.getLastFocused()
  if (focused.id === undefined) return
  await chrome.windows.update(focused.id, { focused: true })
}

export function createSystemNotifier(deps: SystemNotifierDeps): SystemNotifier {
  let lastFocusedWindowId: number | undefined

  const handleFocusChanged = (windowId: number): void => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) lastFocusedWindowId = windowId
  }

  function rememberLastFocusedWindow(): void {
    void chrome.windows
      .getLastFocused()
      .then((focused) => {
        lastFocusedWindowId ??= focused.id
      })
      .catch((error: unknown) => {
        console.warn('Last focused window lookup failed', error)
      })
  }

  function openPanel(): Promise<void> {
    const windowId = lastFocusedWindowId ?? chrome.windows.WINDOW_ID_CURRENT
    return chrome.sidePanel.open({ windowId }).catch(focusLastWindow)
  }

  async function create(notificationId: string, title: string, message: string): Promise<void> {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(ICON_PATH),
      title,
      message,
    })
  }

  async function targetOf(notificationId: string): Promise<PendingTarget> {
    if (notificationId === SUMMARY_NOTIFICATION_ID) return { kind: 'notifications' }
    void deps.markRead(notificationId).catch((error: unknown) => {
      console.warn('Notification read mark failed', error)
    })
    return toPendingTarget(await deps.seen.findTarget(notificationId))
  }

  async function handleClick(notificationId: string, panelOpened: Promise<void>): Promise<void> {
    const target = await targetOf(notificationId)
    await Promise.all([
      setPendingTarget(target),
      chrome.notifications.clear(notificationId),
      panelOpened,
    ])
  }

  const handleClicked = (notificationId: string): void => {
    void handleClick(notificationId, openPanel()).catch((error: unknown) => {
      console.warn('Notification click handling failed', error)
    })
  }

  return {
    attach() {
      chrome.windows.onFocusChanged.addListener(handleFocusChanged)
      chrome.notifications.onClicked.addListener(handleClicked)
      rememberLastFocusedWindow()
      return () => {
        chrome.windows.onFocusChanged.removeListener(handleFocusChanged)
        chrome.notifications.onClicked.removeListener(handleClicked)
      }
    },
    async showNotification(notification) {
      if (await deps.seen.hasShown(notification.id)) return
      await deps.seen.markShown([{ id: notification.id, target: notification.target }])
      if (deps.isPanelOpen()) return
      await create(notification.id, notification.title, notification.body)
    },
    async showSummary(count) {
      if (deps.isPanelOpen()) return
      await create(SUMMARY_NOTIFICATION_ID, APP_TITLE, summaryMessage(count))
    },
    async clearNotifications(notificationIds) {
      await Promise.all(notificationIds.map((id) => chrome.notifications.clear(id)))
    },
    async closeAll() {
      const shown = await chrome.notifications.getAll()
      await Promise.all(Object.keys(shown).map((id) => chrome.notifications.clear(id)))
    },
  }
}

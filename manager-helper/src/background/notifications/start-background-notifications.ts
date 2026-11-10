import { getAuthState } from '@/shared/auth/auth-state'
import { restoreSession } from '@/shared/auth/auth-service'
import { onSessionEnded, onSessionStarted } from '@/shared/auth/session-channel'
import { listNotifications, markNotificationRead } from '@/shared/notifications/notifications-api'
import type { RealtimeEvent } from '@/shared/notifications/notifications-schema'
import { eventMessage } from '@/shared/notifications/panel-protocol'
import { startConnectionWatchdog } from './connection-watchdog'
import { syncMissedNotifications } from './missed-notifications'
import { createNotificationsSocket } from './notifications-socket'
import { createPanelPortHub } from './panel-port-hub'
import { createSeenStore } from './seen-store'
import { createSystemNotifier } from './system-notifier'
import { clearUnreadBadge, setUnreadBadge } from './unread-badge'

const SESSION_MARKER_KEY = 'notificationsSessionActive'
const MISSED_PAGE_SIZE = 50

async function hasSessionMarker(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(SESSION_MARKER_KEY)
    return stored[SESSION_MARKER_KEY] === true
  } catch {
    return false
  }
}

async function setSessionMarker(isActive: boolean): Promise<void> {
  try {
    if (isActive) await chrome.storage.local.set({ [SESSION_MARKER_KEY]: true })
    else await chrome.storage.local.remove(SESSION_MARKER_KEY)
  } catch (error: unknown) {
    console.warn('Notifications session marker write failed', error)
  }
}

function reportFailure(message: string): (error: unknown) => void {
  return (error: unknown) => {
    console.warn(message, error)
  }
}

export function startBackgroundNotifications(): () => void {
  const hub = createPanelPortHub()
  const seen = createSeenStore(() => getAuthState().user?.id ?? null)
  const notifier = createSystemNotifier({
    isPanelOpen: () => hub.isPanelOpen(),
    seen,
    markRead: markNotificationRead,
  })

  let receivedEventCount = 0

  async function handleEvent(event: RealtimeEvent): Promise<void> {
    receivedEventCount += 1
    hub.broadcast(eventMessage(event))
    await setUnreadBadge(event.payload.unreadCount)
    if (event.type === 'notification.created') {
      const { notification } = event.payload
      await seen.advanceLastSeen(notification.createdAt)
      await notifier.showNotification(notification)
      return
    }
    if ('all' in event.payload) await notifier.closeAll()
    else await notifier.clearNotifications(event.payload.notificationIds)
  }

  async function syncAfterConnect(): Promise<void> {
    const eventCountAtStart = receivedEventCount
    const unreadCount = await syncMissedNotifications({
      listUnread: () => listNotifications({ page: 0, limit: MISSED_PAGE_SIZE, unreadOnly: true }),
      seen,
      notifier,
    })
    if (receivedEventCount === eventCountAtStart) await setUnreadBadge(unreadCount)
  }

  const socket = createNotificationsSocket({
    onEvent: (event) => {
      void handleEvent(event).catch(reportFailure('Notifications event handling failed'))
    },
    onStateChange: (state) => {
      hub.setConnectionState(state)
    },
    onConnected: () => {
      void syncAfterConnect().catch(reportFailure('Missed notifications sync failed'))
    },
  })

  let connecting: Promise<void> | null = null

  function ensureConnected(): Promise<void> {
    connecting ??= (async () => {
      if (socket.isAlive()) return
      if (getAuthState().status !== 'authenticated') await restoreSession()
      if (getAuthState().status !== 'authenticated') {
        if (getAuthState().status === 'anonymous') await setSessionMarker(false)
        return
      }
      await setSessionMarker(true)
      await socket.connect()
    })().finally(() => {
      connecting = null
    })
    return connecting
  }

  async function shouldConnect(): Promise<boolean> {
    const { status } = getAuthState()
    if (status === 'authenticated') return true
    if (status === 'restoring' || status === 'offline') return hasSessionMarker()
    return false
  }

  const connectOnTrigger = (): void => {
    void ensureConnected().catch(reportFailure('Notifications connect failed'))
  }

  const detachHub = hub.attach()
  const detachNotifier = notifier.attach()
  chrome.runtime.onStartup.addListener(connectOnTrigger)
  chrome.runtime.onInstalled.addListener(connectOnTrigger)
  const unsubscribeStarted = onSessionStarted(() => {
    socket.disconnect()
    void (async () => {
      await connecting
      await restoreSession()
      await ensureConnected()
    })().catch(reportFailure('Notifications connect failed'))
  })
  const unsubscribeEnded = onSessionEnded(() => {
    socket.disconnect()
    void Promise.all([clearUnreadBadge(), notifier.closeAll(), setSessionMarker(false)]).catch(
      reportFailure('Notifications cleanup failed'),
    )
  })
  const stopWatchdog = startConnectionWatchdog({
    shouldConnect,
    isAlive: () => socket.isAlive(),
    reconnect: ensureConnected,
  })

  void hasSessionMarker().then((isMarked) => {
    if (isMarked) connectOnTrigger()
  })

  return () => {
    detachHub()
    detachNotifier()
    chrome.runtime.onStartup.removeListener(connectOnTrigger)
    chrome.runtime.onInstalled.removeListener(connectOnTrigger)
    unsubscribeStarted()
    unsubscribeEnded()
    stopWatchdog()
    socket.disconnect()
  }
}

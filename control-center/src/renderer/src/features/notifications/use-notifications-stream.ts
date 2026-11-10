import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSessionStore } from '@/features/auth'
import { applyNotificationEvent, NOTIFICATIONS_KEY } from '@/lib/backend/notifications.queries'
import { useNotificationsStore } from '@/stores/notifications.store'
import type { NotificationConnectionState } from '../../../../preload/notifications-bridge'

export function useNotificationsStream(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const bridge = window.api.notifications
    let previousState: NotificationConnectionState | null = null

    const unsubscribeEvents = bridge.onEvent((event) => {
      applyNotificationEvent(queryClient, event)
      if (event.type === 'notification.created') useNotificationsStore.getState().showToast(event.notification)
    })

    const unsubscribeState = bridge.onConnectionState((state) => {
      const isBackOnline = state === 'online' && previousState !== 'online'
      previousState = state
      if (isBackOnline) void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
    })

    const unsubscribeSession = useSessionStore.subscribe((current, previous) => {
      const isLoggedOut = current.snapshot.state === 'unauthenticated' && previous.snapshot.state !== 'unauthenticated'
      if (!isLoggedOut) return
      queryClient.removeQueries({ queryKey: NOTIFICATIONS_KEY })
      useNotificationsStore.getState().reset()
    })

    return () => {
      unsubscribeEvents()
      unsubscribeState()
      unsubscribeSession()
    }
  }, [queryClient])
}

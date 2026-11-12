import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSessionStore } from '@/features/auth'
import { threadHistoryOptions } from '@/features/chat/use-thread-history'
import { applyNotificationEvent, NOTIFICATIONS_KEY } from '@/lib/backend/notifications.queries'
import { isMeetingTranscriptNotification, type Notification } from '@/lib/backend/notifications.schema'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useUiStore } from '@/stores/ui.store'
import type { NotificationConnectionState } from '../../../../preload/notifications-bridge'

export function useNotificationsStream(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const bridge = window.api.notifications
    let previousState: NotificationConnectionState | null = null

    const unsubscribeEvents = bridge.onEvent((event) => {
      applyNotificationEvent(queryClient, event)
      if (event.type !== 'notification.created') return
      const { notification } = event
      if (isOpenChatTranscript(notification)) {
        // The system message is in the history of the selected chat: reread it instead of a separate event
        void queryClient.invalidateQueries({ queryKey: threadHistoryOptions(notification.target.id).queryKey })
        // The user is looking at that chat: the message shows up in the feed, a toast would repeat it
        if (useUiStore.getState().section === 'chats') return
      }
      useNotificationsStore.getState().showToast(notification)
    })

    const unsubscribeState = bridge.onConnectionState((state) => {
      const isBackOnline = state === 'online' && previousState !== 'online'
      previousState = state
      if (isBackOnline) void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
    })

    const unsubscribeSession = useSessionStore.subscribe((current, previous) => {
      const isLoggedOut = current.snapshot.state === 'unauthenticated' && previous.snapshot.state !== 'unauthenticated'
      const previousUserId = previous.snapshot.user?.id
      const isUserSwitched =
        current.snapshot.user !== null && previousUserId !== undefined && current.snapshot.user.id !== previousUserId
      if (!isLoggedOut && !isUserSwitched) return
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

function isOpenChatTranscript(notification: Notification): boolean {
  return (
    isMeetingTranscriptNotification(notification) && useChatStore.getState().activeThreadId === notification.target.id
  )
}

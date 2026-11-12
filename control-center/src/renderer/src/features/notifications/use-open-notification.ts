import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { threadHistoryOptions } from '@/features/chat/use-thread-history'
import { TaskNotFoundError, ThreadNotFoundError } from '@/lib/backend/errors'
import { useMarkNotificationRead } from '@/lib/backend/notifications.queries'
import { NOTIFICATION_TARGET, type Notification } from '@/lib/backend/notifications.schema'
import { taskQuery } from '@/lib/backend/tasks.queries'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'

export const TASK_NOT_FOUND_NOTICE = 'Задача не найдена'
export const CHAT_NOT_FOUND_NOTICE = 'Чат не найден'

export function useOpenNotification(): (notification: Notification) => void {
  const queryClient = useQueryClient()
  const { mutate: markRead } = useMarkNotificationRead()

  return useCallback(
    (notification: Notification) => {
      useNotificationsStore.getState().dismiss(notification.id)
      if (notification.readAt === null) markRead(notification.id)

      if (notification.target.type === NOTIFICATION_TARGET.task) {
        const taskId = notification.target.id
        useUiStore.getState().setSection('tasks')
        useTasksStore.getState().selectTask(taskId)
        queryClient.fetchQuery(taskQuery(taskId)).catch((error: unknown) => {
          if (error instanceof TaskNotFoundError) useNotificationsStore.getState().showNotice(TASK_NOT_FOUND_NOTICE)
        })
        return
      }

      if (notification.target.type === NOTIFICATION_TARGET.chat) {
        const threadId = notification.target.id
        useUiStore.getState().setSection('chats')
        useChatStore.getState().setActiveThread(threadId)
        // The open chat drops itself when its history is not found; the notice tells why
        queryClient.fetchQuery(threadHistoryOptions(threadId)).catch((error: unknown) => {
          if (error instanceof ThreadNotFoundError) useNotificationsStore.getState().showNotice(CHAT_NOT_FOUND_NOTICE)
        })
      }
    },
    [queryClient, markRead]
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { TaskNotFoundError } from '@/lib/backend/errors'
import { useMarkNotificationRead } from '@/lib/backend/notifications.queries'
import type { Notification } from '@/lib/backend/notifications.schema'
import { taskQuery } from '@/lib/backend/tasks.queries'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'

export const TASK_NOT_FOUND_NOTICE = 'Задача не найдена'
const TASK_TARGET = 'task'

export function useOpenNotification(): (notification: Notification) => void {
  const queryClient = useQueryClient()
  const { mutate: markRead } = useMarkNotificationRead()

  return useCallback(
    (notification: Notification) => {
      useNotificationsStore.getState().dismiss(notification.id)
      if (notification.readAt === null) markRead(notification.id)
      if (notification.target.type !== TASK_TARGET) return

      const taskId = notification.target.id
      useUiStore.getState().setSection('tasks')
      useTasksStore.getState().selectTask(taskId)
      queryClient.fetchQuery(taskQuery(taskId)).catch((error: unknown) => {
        if (error instanceof TaskNotFoundError) useNotificationsStore.getState().showNotice(TASK_NOT_FOUND_NOTICE)
      })
    },
    [queryClient, markRead]
  )
}

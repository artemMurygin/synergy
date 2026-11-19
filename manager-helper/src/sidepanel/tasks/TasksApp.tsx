import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { getAuthState, subscribeAuth } from '@/shared/auth/auth-state'
import { TasksSplitView } from './TasksSplitView'

interface Props {
  requestedTaskId?: string | null
  onTaskRequestHandled?: () => void
  /** Notifications and profile for the top bar of a narrow panel. */
  trailing?: ReactNode
}

/** Tasks section: "my open tasks" list with quick create and the details of the chosen task. */
export function TasksApp({
  requestedTaskId,
  onTaskRequestHandled,
  trailing,
}: Props) {
  const user = useSyncExternalStore(subscribeAuth, getAuthState).user
  if (user === null) return <section aria-label="Задачи" className="flex min-h-0 flex-1" />
  return (
    <TasksSplitView
      key={user.id}
      userId={user.id}
      login={user.login}
      requestedTaskId={requestedTaskId}
      onTaskRequestHandled={onTaskRequestHandled}
      trailing={trailing}
    />
  )
}

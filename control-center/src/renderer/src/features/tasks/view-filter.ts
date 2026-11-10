import type { TaskFilters } from '@/lib/backend/tasks.api'

export const TASK_VIEWS = ['all', 'mine', 'watching', 'created', 'overdue'] as const
export type TaskView = (typeof TASK_VIEWS)[number]

/** Maps a quick view to the API filters it implies. */
export function viewToFilter(view: TaskView, userId: string): TaskFilters {
  switch (view) {
    case 'all':
      return {}
    case 'mine':
      return { assigneeId: userId }
    case 'watching':
      return { watcherId: userId }
    case 'created':
      return { creatorId: userId }
    case 'overdue':
      return { overdue: true }
  }
}

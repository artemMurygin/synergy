import type { TaskView } from '@synergy/ui-kit'
import type { TaskFilters } from '@/lib/backend/tasks.api'


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

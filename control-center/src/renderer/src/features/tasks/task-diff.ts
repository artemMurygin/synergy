import type { CreateTaskInput, UpdateTaskInput } from '@/lib/backend/tasks.api'
import type { TaskDetails } from '@/lib/backend/tasks.schema'

const MINUTE_MS = 60_000
// the form edits the deadline with minute precision
const minutes = (iso: string): number => Math.floor(new Date(iso).getTime() / MINUTE_MS)

/**
 * Only the fields the form changed. A cleared deadline or assignee becomes `null`.
 * Deactivated users are not shown in the form, so they never count as a change.
 */
export function diffTask(task: TaskDetails, input: CreateTaskInput): UpdateTaskInput {
  const patch: UpdateTaskInput = {}

  if (input.title !== task.title) patch.title = input.title

  const description = input.description ?? ''
  if (description !== task.description) patch.description = description

  const deadline = input.deadline ?? null
  const sameDeadline =
    deadline === null || task.deadline === null ? deadline === task.deadline : minutes(deadline) === minutes(task.deadline)
  if (!sameDeadline) patch.deadline = deadline

  const assigneeId = input.assigneeId ?? null
  const hiddenAssignee = task.assignee !== null && task.assignee.login === null
  const sameAssignee = hiddenAssignee && assigneeId === null ? true : assigneeId === (task.assignee?.id ?? null)
  if (!sameAssignee) patch.assigneeId = assigneeId

  const watcherIds = input.watcherIds ?? []
  const before = task.watchers.filter((w) => w.login !== null).map((w) => w.id)
  const sameWatchers = watcherIds.length === before.length && watcherIds.every((id) => before.includes(id))
  if (!sameWatchers) patch.watcherIds = watcherIds

  return patch
}

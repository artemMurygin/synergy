export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** `login` равен null у деактивированного пользователя. */
export type TaskUser = { id: string; login: string | null }
export type UserSummary = { id: string; login: string }

export type TaskItem = {
  id: string
  title: string
  description: string
  status: TaskStatus
  deadline: string | null
  creator: TaskUser
  assignee: TaskUser | null
  watchers: TaskUser[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  attachmentCount: number
}

export type TaskAttachment = {
  id: string
  originalName: string
  sizeBytes: number
  uploadedBy?: string
}

export type TaskDetailsData = TaskItem & { attachments: TaskAttachment[] }

export type TaskStatusFilter = 'all' | TaskStatus
export type TaskSort = 'deadline' | 'updated' | 'created'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово',
}

export const loginOf = (user: TaskUser | null): string =>
  user === null ? 'Не назначен' : (user.login ?? 'Неактивный пользователь')

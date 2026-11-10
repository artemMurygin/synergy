import type { Task } from '@/lib/backend/tasks.schema'

export const NOW = new Date('2026-03-10T12:00:00Z')

export const mkTask = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Задача ${id}`,
  description: '',
  status: 'todo',
  deadline: null,
  creator: { id: 'u1', login: 'admin' },
  assignee: { id: 'u2', login: 'anna' },
  watchers: [],
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  completedAt: null,
  attachmentCount: 0,
  ...extra
})

import type { Task, TaskDetails } from '@/shared/tasks-api'

export function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Задача ${id}`,
    description: '',
    status: 'todo',
    deadline: null,
    creator: { id: 'u1', login: 'anna' },
    assignee: { id: 'u1', login: 'anna' },
    watchers: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

export function makeDetails(id: string, overrides: Partial<TaskDetails> = {}): TaskDetails {
  return { ...makeTask(id), attachments: [], ...overrides }
}

/** A fixed-width utility class (`w-80`, `min-w-[..]`); fractions and `min-w-0` are fine. */
export const FIXED_WIDTH = /(^|[\s"])(?!min-w-0)(min-)?w-(\d+(?![\d/.])|\[)/

import type { TaskDetailsData, TaskItem } from './types'

export const NOW = new Date('2026-11-19T12:00:00')

export function makeTask(over: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't1',
    title: 'Подготовить КП',
    description: 'Собрать условия',
    status: 'in_progress',
    deadline: '2026-12-12T18:00:00',
    creator: { id: 'u2', login: 'anna' },
    assignee: { id: 'u1', login: 'maria' },
    watchers: [],
    createdAt: '2026-11-10T09:12:00',
    updatedAt: '2026-11-19T11:00:00',
    completedAt: null,
    attachmentCount: 2,
    ...over,
  }
}

export function makeDetails(over: Partial<TaskDetailsData> = {}): TaskDetailsData {
  return {
    ...makeTask(),
    attachments: [
      { id: 'a1', originalName: 'КП_МВА.pdf', sizeBytes: 1_468_006, uploadedBy: 'u1' },
      { id: 'a2', originalName: 'Расчёт.xlsx', sizeBytes: 2048, uploadedBy: 'u2' },
    ],
    ...over,
  }
}

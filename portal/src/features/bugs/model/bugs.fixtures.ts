import type { BugListItem, BugResponse } from './bugs.schema'

/** Shape of `BugResponse` from backend `bugs.responses.ts`. */
export const bugFixture: BugResponse = {
  id: '3f0c2d9e-7a31-4c55-9a52-1f6d8b0e4a22',
  title: 'Ассистент не отвечает',
  description: 'Нажал «Отправить», ответа нет',
  product: { id: 'p1', name: 'Manager Helper' },
  agent: { id: 'a1', name: 'Ассистент' },
  author: { id: 'u1', login: 'ivan', fullName: 'Иванов Иван Иванович' },
  status: 'open',
  createdAt: '2026-11-10T09:00:00.000Z',
  statusChangedAt: '2026-11-10T09:00:00.000Z',
  statusChangedBy: null,
  wontFixReason: null,
  nextStatuses: []
}

export const bugListItemFixture: BugListItem = {
  id: bugFixture.id,
  title: bugFixture.title,
  product: bugFixture.product,
  agent: bugFixture.agent,
  status: 'open',
  createdAt: bugFixture.createdAt,
  statusChangedAt: bugFixture.statusChangedAt,
  author: bugFixture.author
}

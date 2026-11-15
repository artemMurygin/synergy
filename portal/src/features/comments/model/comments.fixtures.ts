import type { Comment } from './comments.schema'

export const commentFixture: Comment = {
  id: 'c1',
  body: 'Первый комментарий',
  author: { id: 'u1', login: 'author', fullName: 'Иван Иванов' },
  authorRole: 'request_author',
  createdAt: '2026-11-14T12:42:00.000Z',
  editedAt: null,
  canEdit: true
}

export const developerCommentFixture: Comment = {
  id: 'c2',
  body: 'Ответ разработчика',
  author: { id: 'u2', login: 'dev', fullName: 'Пётр Петров' },
  authorRole: 'developer',
  createdAt: '2026-11-14T12:50:00.000Z',
  editedAt: null,
  canEdit: false
}

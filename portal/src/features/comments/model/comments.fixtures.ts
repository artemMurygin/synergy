import type { Comment } from './comments.schema'

/**
 * Фикстуры повторяют форму ответа бэкенда CommentResponse / CommentListResponse
 * (backend/src/modules/portal/interface/http/comments.responses.ts):
 * даты — ISO-строки из Date.toISOString(), editedAt — null или ISO, authorRole — request_author | developer.
 */

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

/** Тело GET /portal/requests/:id/comments в форме CommentListResponse. */
export const commentListResponseFixture = {
  items: [commentFixture, developerCommentFixture]
}

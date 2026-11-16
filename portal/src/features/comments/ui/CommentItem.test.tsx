import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { formatDateTime } from '@/lib/format'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { commentFixture, developerCommentFixture } from '../model/comments.fixtures'
import type { Comment } from '../model/comments.schema'
import { CommentItem } from './CommentItem'

const requestId = 'r1'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'a', mustChangePassword: false, roles: [], fullName: 'a', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function hasClasses(el: HTMLElement, ...names: string[]) {
  for (const name of names) expect(el.className.split(/\s+/)).toContain(name)
}

function renderItem(comment: Comment) {
  const Wrapper = queryWrapper(createTestClient())
  return render(<CommentItem subject="requests" subjectId={requestId} comment={comment} />, { wrapper: Wrapper })
}

describe('CommentItem', () => {
  it('shows name, request author role mark, time and text', () => {
    renderItem(commentFixture)
    expect(screen.getByText('Иван Иванов')).toBeTruthy()
    expect(screen.getByText('Автор заявки')).toBeTruthy()
    expect(screen.getByText(formatDateTime(commentFixture.createdAt))).toBeTruthy()
    expect(screen.getByText('Первый комментарий')).toBeTruthy()
    expect(screen.queryByText(/изменено/)).toBeNull()
  })

  it('shows the bug author role mark with the same neutral tone', () => {
    renderItem({ ...commentFixture, authorRole: 'bug_author' })
    expect(screen.getByText('Автор обращения')).toBeTruthy()
    expect(screen.queryByText('Автор заявки')).toBeNull()
  })

  it('shows the developer role mark', () => {
    renderItem(developerCommentFixture)
    expect(screen.getByText('Разработчик')).toBeTruthy()
  })

  it('shows "· изменено" when editedAt is set', () => {
    renderItem({ ...commentFixture, editedAt: '2026-11-14T12:45:00.000Z' })
    expect(screen.getByText('· изменено')).toBeTruthy()
  })

  it('keeps markup as plain text with whitespace-pre-wrap', () => {
    const body = '<b>жирный</b>\nвторая строка'
    const { container } = renderItem({ ...commentFixture, body })
    expect(container.querySelector('b')).toBeNull()
    const node = screen.getByText((_, el) => el?.textContent === body && el.children.length === 0)
    hasClasses(node, 'whitespace-pre-wrap', 'break-words')
  })

  it('truncates a long name', () => {
    renderItem({ ...commentFixture, author: { ...commentFixture.author, fullName: 'Очень длинное имя '.repeat(10).trim() } })
    hasClasses(screen.getByText(/Очень длинное имя/), 'truncate')
  })

  it('shows "Изменить" only when canEdit', () => {
    const { unmount } = renderItem(commentFixture)
    expect(screen.getByRole('button', { name: 'Изменить' })).toBeTruthy()
    unmount()
    renderItem({ ...commentFixture, canEdit: false })
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
  })

  it('edits in place: cancel restores the original text', async () => {
    const user = userEvent.setup()
    renderItem(commentFixture)
    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const field = screen.getByRole('textbox')
    expect(field).toHaveProperty('value', 'Первый комментарий')
    await user.clear(field)
    await user.type(field, 'другое')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Первый комментарий')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Первый комментарий')
  })

  it('saves the edited text', async () => {
    const user = userEvent.setup()
    const { calls } = stubFetch((call) => json({ ...commentFixture, body: (call.body as { body: string }).body, editedAt: '2026-11-14T12:45:00.000Z' }))
    renderItem(commentFixture)
    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const field = screen.getByRole('textbox')
    await user.clear(field)
    await user.type(field, 'новый текст')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/portal/requests/r1/comments/c1', body: { body: 'новый текст' } })
  })

  it('disables Save for an empty text', async () => {
    const user = userEvent.setup()
    renderItem(commentFixture)
    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    await user.clear(screen.getByRole('textbox'))
    expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveProperty('disabled', true)
  })

  it('on 409 shows the expiry warning, the original text and hides "Изменить"', async () => {
    const user = userEvent.setup()
    stubFetch(() => json({ code: 'PORTAL_COMMENT_EDIT_EXPIRED', message: 'x' }, 409))
    renderItem(commentFixture)
    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const field = screen.getByRole('textbox')
    await user.clear(field)
    await user.type(field, 'поздно')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Изменить комментарий уже нельзя: прошло больше 15 минут')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Первый комментарий')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
  })
})

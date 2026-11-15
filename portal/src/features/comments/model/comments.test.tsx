import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { ApiError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { COMMENTS_KEY } from '@/lib/query-keys'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { editComment, listComments, postComment } from './comments.api'
import { commentErrorMessage, COMMENT_EDIT_EXPIRED_MESSAGE, COMMENT_ERROR_FALLBACK } from './comments.errors'
import { commentsQuery } from './comments.queries'
import { commentFixture, developerCommentFixture } from './comments.fixtures'
import { commentListSchema, commentSchema } from './comments.schema'
import { useEditComment } from './use-edit-comment'
import { usePostComment } from './use-post-comment'

const requestId = 'r1'
const key = [...COMMENTS_KEY, requestId]

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'a', mustChangePassword: false, roles: [], fullName: 'a', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('comments.schema', () => {
  it('accepts a comment with editedAt null and a role enum', () => {
    expect(commentSchema.parse(commentFixture)).toEqual(commentFixture)
    expect(commentListSchema.parse({ items: [commentFixture] }).items).toHaveLength(1)
  })

  it('rejects an unknown authorRole', () => {
    expect(commentSchema.safeParse({ ...commentFixture, authorRole: 'admin' }).success).toBe(false)
  })

  it('accepts editedAt as a string', () => {
    expect(commentSchema.parse({ ...commentFixture, editedAt: '2026-11-14T12:45:00.000Z' }).editedAt).toBe('2026-11-14T12:45:00.000Z')
  })
})

describe('comments.api', () => {
  it('listComments asks the feed of the request', async () => {
    const { calls } = stubFetch(() => json({ items: [commentFixture] }))
    expect(await listComments(requestId)).toEqual({ items: [commentFixture] })
    expect(calls[0]).toMatchObject({ method: 'GET', path: `/portal/requests/${requestId}/comments` })
  })

  it('postComment posts the body', async () => {
    const { calls } = stubFetch(() => json(commentFixture, 201))
    await postComment(requestId, 'текст')
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/portal/requests/${requestId}/comments`, body: { body: 'текст' } })
  })

  it('editComment patches the comment', async () => {
    const { calls } = stubFetch(() => json(commentFixture))
    await editComment(requestId, 'c1', 'новый')
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: `/portal/requests/${requestId}/comments/c1`, body: { body: 'новый' } })
  })
})

describe('commentsQuery', () => {
  it('polls every 30 s only while the tab is visible', () => {
    const options = commentsQuery(requestId)
    expect(options.queryKey).toEqual(key)
    expect(options.refetchInterval).toBe(30_000)
    expect(options.refetchOnWindowFocus).toBe(true)
    expect(options.refetchIntervalInBackground).toBe(false)
  })

  it('loads the list', async () => {
    stubFetch(() => json({ items: [commentFixture] }))
    expect((await createTestClient().fetchQuery(commentsQuery(requestId))).items).toHaveLength(1)
  })
})

describe('formatDateTime', () => {
  it('formats as «14 ноября, 15:42»', () => {
    expect(formatDateTime(new Date(2026, 10, 14, 15, 42).toISOString())).toBe('14 ноября, 15:42')
  })
})

describe('usePostComment', () => {
  it('appends the new comment to the end of the cached feed and invalidates it', async () => {
    const client = createTestClient()
    client.setQueryData(key, { items: [commentFixture] })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    stubFetch(() => json(developerCommentFixture, 201))
    const { result } = renderHook(() => usePostComment(requestId), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync('Ответ'))
    expect(client.getQueryData<{ items: unknown[] }>(key)?.items).toEqual([commentFixture, developerCommentFixture])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key })
  })

  it('does not touch the cache on failure', async () => {
    const client = createTestClient()
    client.setQueryData(key, { items: [commentFixture] })
    stubFetch(() => json({ message: 'x' }, 400))
    const { result } = renderHook(() => usePostComment(requestId), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync('').catch(() => undefined)
    })
    expect(client.getQueryData<{ items: unknown[] }>(key)?.items).toEqual([commentFixture])
  })
})

describe('useEditComment', () => {
  it('replaces the comment in the cache on success', async () => {
    const client = createTestClient()
    client.setQueryData(key, { items: [commentFixture, developerCommentFixture] })
    const edited = { ...commentFixture, body: 'правка', editedAt: '2026-11-14T12:45:00.000Z' }
    stubFetch(() => json(edited))
    const { result } = renderHook(() => useEditComment(requestId), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync({ commentId: 'c1', body: 'правка' }))
    expect(client.getQueryData<{ items: unknown[] }>(key)?.items).toEqual([edited, developerCommentFixture])
  })

  it.each([409, 403])('invalidates the feed on %i', async (status) => {
    const client = createTestClient()
    client.setQueryData(key, { items: [commentFixture] })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    stubFetch(() => json({ message: 'x', code: 'C' }, status))
    const { result } = renderHook(() => useEditComment(requestId), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync({ commentId: 'c1', body: 'a' }).catch(() => undefined)
    })
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: key }))
  })

  it('does not invalidate on 400', async () => {
    const client = createTestClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    stubFetch(() => json({ message: 'x' }, 400))
    const { result } = renderHook(() => useEditComment(requestId), { wrapper: queryWrapper(client) })
    await act(async () => {
      await result.current.mutateAsync({ commentId: 'c1', body: 'a' }).catch(() => undefined)
    })
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('commentErrorMessage', () => {
  it('maps the expired window by code', () => {
    expect(commentErrorMessage(new ApiError('conflict', 's', 409, 'PORTAL_COMMENT_EDIT_EXPIRED'))).toBe(
      'Изменить комментарий уже нельзя: прошло больше 15 минут'
    )
    expect(COMMENT_EDIT_EXPIRED_MESSAGE).toBe('Изменить комментарий уже нельзя: прошло больше 15 минут')
  })

  it('maps not-owned, bad request and the rest', () => {
    expect(commentErrorMessage(new ApiError('forbidden', 's', 403, 'PORTAL_COMMENT_NOT_OWNED'))).toBe('Редактировать можно только свой комментарий')
    expect(commentErrorMessage(new ApiError('bad_request', 'x', 400))).toBe('Комментарий должен содержать от 1 до 4000 символов')
    expect(commentErrorMessage(new ApiError('unavailable', 'x'))).toBe(COMMENT_ERROR_FALLBACK)
    expect(commentErrorMessage(new Error('boom'))).toBe(COMMENT_ERROR_FALLBACK)
  })
})

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { COMMENTS_KEY } from '@/lib/query-keys'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { commentFixture, developerCommentFixture } from '../model/comments.fixtures'
import { CommentsSection } from './CommentsSection'

const requestId = 'r1'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'a', mustChangePassword: false, roles: [], fullName: 'a', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderSection(client = createTestClient()) {
  const Wrapper = queryWrapper(client)
  return { client, ...render(<CommentsSection requestId={requestId} />, { wrapper: Wrapper }) }
}

describe('CommentsSection', () => {
  it('shows a skeleton and no count on first load, with the composer visible', () => {
    stubFetch(() => new Promise<Response>(() => undefined))
    const { container } = renderSection()
    expect(screen.getByRole('heading', { name: 'Комментарии' })).toBeTruthy()
    expect(screen.queryByText(/^\d+$/)).toBeNull()
    expect(container.querySelector('[data-testid="comments-skeleton"]')).toBeTruthy()
    expect(screen.getByLabelText('Новый комментарий')).toBeTruthy()
  })

  it('shows the count and the feed', async () => {
    stubFetch(() => json({ items: [commentFixture, developerCommentFixture] }))
    renderSection()
    expect(await screen.findByText('Первый комментарий')).toBeTruthy()
    expect(screen.getByText('Ответ разработчика')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByLabelText('Новый комментарий')).toBeTruthy()
  })

  it('shows the empty hint without a count', async () => {
    stubFetch(() => json({ items: [] }))
    renderSection()
    expect(await screen.findByText('Комментариев пока нет. Задайте вопрос или уточните детали')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByLabelText('Новый комментарий')).toBeTruthy()
  })

  it('shows an error alert with retry, keeps the composer, and retry reloads', async () => {
    let fail = true
    const { calls } = stubFetch(() => (fail ? json({ code: 'X', message: 'boom' }, 500) : json({ items: [commentFixture] })))
    renderSection()
    expect(await screen.findByText('Не удалось загрузить комментарии')).toBeTruthy()
    expect(screen.getByLabelText('Новый комментарий')).toBeTruthy()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Первый комментарий')).toBeTruthy()
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('shows a new comment after refetch without resetting the typed text and without a skeleton', async () => {
    let items = [commentFixture]
    stubFetch(() => json({ items }))
    const { client, container } = renderSection()
    await screen.findByText('Первый комментарий')
    await userEvent.type(screen.getByLabelText('Новый комментарий'), 'черновик')
    items = [commentFixture, developerCommentFixture]
    const refetch = client.invalidateQueries({ queryKey: [...COMMENTS_KEY, requestId] })
    expect(container.querySelector('[data-testid="comments-skeleton"]')).toBeNull()
    await refetch
    await waitFor(() => expect(screen.getByText('Ответ разработчика')).toBeTruthy())
    expect((screen.getByLabelText('Новый комментарий') as HTMLTextAreaElement).value).toBe('черновик')
    expect(screen.getByText('Первый комментарий')).toBeTruthy()
  })
})

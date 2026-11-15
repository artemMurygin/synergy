import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { commentFixture } from '../model/comments.fixtures'
import { CommentComposer } from './CommentComposer'

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

const field = () => screen.getByPlaceholderText('Напишите комментарий…')
const send = () => screen.getByRole('button', { name: /Отправить|Отправляем/ })

function renderComposer() {
  return render(<CommentComposer subject="requests" subjectId="r1" />, { wrapper: queryWrapper(createTestClient()) })
}

describe('CommentComposer', () => {
  it('disables send for empty and whitespace-only text', async () => {
    const user = userEvent.setup()
    renderComposer()
    expect(send()).toHaveProperty('disabled', true)
    await user.type(field(), '   ')
    expect(send()).toHaveProperty('disabled', true)
    await user.type(field(), 'привет')
    expect(send()).toHaveProperty('disabled', false)
  })

  it('over 4000 characters: error, counter, send disabled', () => {
    renderComposer()
    const long = 'я'.repeat(4001)
    const el = field() as HTMLTextAreaElement
    // paste via the native setter keeps the test fast
    el.focus()
    return userEvent.setup().paste(long).then(() => {
      expect(screen.getByText('Комментарий длиннее 4000 символов. Сократите текст')).toBeTruthy()
      expect(screen.getByText(/4\s?001 \/ 4000/)).toBeTruthy()
      expect(field().getAttribute('aria-invalid')).toBe('true')
      expect(send()).toHaveProperty('disabled', true)
    })
  })

  it('exactly 4000 characters is allowed', async () => {
    const user = userEvent.setup()
    renderComposer()
    field().focus()
    await user.paste('я'.repeat(4000))
    expect(send()).toHaveProperty('disabled', false)
    expect(screen.queryByText(/Сократите текст/)).toBeNull()
  })

  it('posts the trimmed text, shows the pending state once and clears the field on success', async () => {
    const user = userEvent.setup()
    let release: (r: Response) => void = () => undefined
    const { calls } = stubFetch(() => new Promise<Response>((resolve) => { release = resolve }))
    renderComposer()
    await user.type(field(), '  привет  ')
    await user.click(send())
    expect(await screen.findByRole('button', { name: 'Отправляем…' })).toHaveProperty('disabled', true)
    expect(field()).toHaveProperty('disabled', true)
    await user.click(screen.getByRole('button', { name: 'Отправляем…' }))
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    release(json({ ...commentFixture, body: 'привет' }, 201))
    await waitFor(() => expect(field()).toHaveProperty('value', ''))
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/requests/r1/comments', body: { body: 'привет' } })
  })

  it('on error shows the alert and keeps the text', async () => {
    const user = userEvent.setup()
    stubFetch(() => json({ code: 'X', message: 'boom' }, 500))
    renderComposer()
    await user.type(field(), 'привет')
    await user.click(send())
    expect(await screen.findByText('Не удалось отправить комментарий')).toBeTruthy()
    expect(field()).toHaveProperty('value', 'привет')
    expect(send()).toHaveProperty('disabled', false)
  })

  it('has no audience hint and a full-width send button on narrow screens', () => {
    renderComposer()
    hasClasses(screen.getByText('Комментарий увидят автор заявки и разработчики'), 'hidden', 'sm:block')
    hasClasses(send(), 'w-full', 'sm:w-auto')
  })
})

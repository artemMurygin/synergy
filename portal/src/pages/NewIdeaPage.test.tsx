import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, queryWrapper, requestFixture, stubFetch } from '@/test/helpers'
import { MyRequestsPage } from './MyRequestsPage'
import { NewIdeaPage } from './NewIdeaPage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter initialEntries={['/ideas/new']}>
        <Routes>
          <Route path="/ideas/new" element={<NewIdeaPage />} />
          <Route path="/requests" element={<MyRequestsPage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

async function fill(user: ReturnType<typeof userEvent.setup>, title = 'Сверка актов') {
  if (title) await user.type(screen.getByLabelText('Название'), title)
  await user.type(screen.getByLabelText('Описание процесса'), 'Сверяю вручную')
  await user.type(screen.getByLabelText('Сколько раз'), '5')
  await user.type(screen.getByLabelText('Минут за один раз'), '20')
  await user.type(screen.getByLabelText('Сколько человек так делают'), '3')
}

describe('NewIdeaPage', () => {
  it('shows a confirmation and opens "Мои заявки" after a successful submit', async () => {
    stubFetch((c) =>
      c.method === 'POST' ? json(requestFixture, 201) : json({ items: [requestFixture], total: 1, limit: 20, page: 0 })
    )
    renderPage()
    const user = userEvent.setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Отправить идею' }))
    expect(await screen.findByRole('heading', { name: 'Мои заявки' })).toBeTruthy()
    expect(screen.getByText(/Идея отправлена/)).toBeTruthy()
    expect(await screen.findByText('Сверка актов')).toBeTruthy()
  })

  it('shows field errors and does not send an invalid form', async () => {
    const { fn } = stubFetch(() => json(requestFixture, 201))
    renderPage()
    const user = userEvent.setup()
    await fill(user, '')
    await user.click(screen.getByRole('button', { name: 'Отправить идею' }))
    expect(screen.getByLabelText('Название').getAttribute('aria-invalid')).toBe('true')
    expect(fn).not.toHaveBeenCalled()
  })

  it('keeps the input when the server fails', async () => {
    stubFetch(() => json({ message: 'Сбой' }, 500))
    renderPage()
    const user = userEvent.setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Отправить идею' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Сверка актов')
    expect(screen.queryByRole('heading', { name: 'Мои заявки' })).toBeNull()
  })
})

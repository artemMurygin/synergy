import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, page, queryWrapper, requestFixture, stubFetch } from '@/test/helpers'
import { MyRequestsPage } from './MyRequestsPage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage(client = createTestClient()) {
  const Wrapper = queryWrapper(client)
  render(
    <Wrapper>
      <MemoryRouter initialEntries={['/requests']}>
        <Routes>
          <Route path="/requests" element={<MyRequestsPage />} />
          <Route path="/ideas/new" element={<Link to="/requests">back</Link>} />
          <Route path="/requests/:id" element={<Link to="/requests">back</Link>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

describe('MyRequestsPage', () => {
  it('shows the loading state, then the list with the status', async () => {
    stubFetch(() => json(page([requestFixture])))
    renderPage()
    expect(screen.getByText('Загружаем заявки…')).toBeTruthy()
    expect(await screen.findByText('Сверка актов')).toBeTruthy()
    expect(screen.getByText('На рассмотрении')).toBeTruthy()
  })

  it('shows the empty state with a link to submit an idea', async () => {
    stubFetch(() => json(page([])))
    renderPage()
    expect((await screen.findByRole('link', { name: 'Подать идею' })).getAttribute('href')).toBe('/ideas/new')
  })

  it('shows an error with a retry that reloads the list', async () => {
    let fail = true
    const { fn } = stubFetch(() => (fail ? json({ message: 'Сбой' }, 500) : json(page([requestFixture]))))
    renderPage()
    await screen.findByRole('button', { name: 'Повторить' })
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Сверка актов')).toBeTruthy()
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('reloads the actual status on every opening of the section', async () => {
    let status: { code: 'pending' | 'in_dev'; label: string } = { code: 'pending', label: 'На рассмотрении' }
    stubFetch(() => json(page([{ ...requestFixture, status }])))
    renderPage()
    expect(await screen.findByText('На рассмотрении')).toBeTruthy()
    status = { code: 'in_dev', label: 'В разработке' }
    await userEvent.click(screen.getByRole('link', { name: /Сверка актов/ }))
    await userEvent.click(screen.getByRole('link', { name: 'back' }))
    expect(await screen.findByText('В разработке')).toBeTruthy()
  })
})

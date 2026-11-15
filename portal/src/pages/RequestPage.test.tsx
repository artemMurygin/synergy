import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth, useSessionStore } from '@/features/auth'
import type { Profile } from '@/lib/schemas'
import { agentFixture, createTestClient, json, page, queryWrapper, requestFixture, skillFixture, stubFetch, type FetchCall } from '@/test/helpers'
import { LoginPage } from './LoginPage'
import { RequestPage } from './RequestPage'

const employee: Profile = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null }
const developer: Profile = { ...employee, login: 'dev', roles: ['developer'] }
const ID = requestFixture.id

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/requests" element={<p>requests-page</p>} />
            <Route path="/requests/:id" element={<RequestPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

function api(handler: (c: FetchCall) => Response | undefined) {
  return stubFetch((c) => {
    if (c.path === '/portal/agents') return json([agentFixture])
    if (c.path === '/portal/skills') return json(page([skillFixture]))
    return handler(c) ?? json({}, 404)
  })
}

describe('RequestPage', () => {
  it('shows the request to its author without a decision panel', async () => {
    useSessionStore.getState().signIn('t', employee)
    api((c) => (c.path === `/portal/requests/${ID}` ? json(requestFixture) : undefined))
    renderAt(`/requests/${ID}`)
    expect(await screen.findByRole('heading', { name: 'Сверка актов' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Решение по заявке' })).toBeNull()
  })

  it.each([
    ['a missing or foreign request (404)', ID],
    ['a malformed id', 'not-an-id']
  ])('shows "Заявка не найдена" with a link for %s, without a technical error', async (_name, id) => {
    useSessionStore.getState().signIn('t', employee)
    api(() => json({ message: 'Request not found' }, 404))
    renderAt(`/requests/${id}`)
    expect(await screen.findByRole('heading', { name: 'Заявка не найдена' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'К моим заявкам' }).getAttribute('href')).toBe('/requests')
    expect(screen.queryByText(/Request not found/)).toBeNull()
  })

  it('shows a retry for a server failure', async () => {
    useSessionStore.getState().signIn('t', employee)
    api(() => json({ message: 'boom' }, 500))
    renderAt(`/requests/${ID}`)
    expect(await screen.findByRole('button', { name: 'Повторить' }, { timeout: 4000 })).toBeTruthy()
  })

  it('shows the decision panel to a developer for a pending request and updates after the decision', async () => {
    useSessionStore.getState().signIn('t', developer)
    let decided = false
    const accepted = {
      ...requestFixture,
      status: { code: 'planned' as const, label: 'Запланировано' },
      skill: { id: 's1', name: 'Сводка встречи', description: 'Делает сводку' }
    }
    api((c) => {
      if (c.method === 'POST' && c.path === `/portal/requests/${ID}/accept`) {
        decided = true
        return json(accepted)
      }
      if (c.path === `/portal/requests/${ID}`) return json(decided ? accepted : requestFixture)
    })
    renderAt(`/requests/${ID}`)
    expect(await screen.findByRole('heading', { name: 'Решение по заявке' })).toBeTruthy()
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Навык'), 's1')
    await user.click(screen.getByRole('button', { name: 'Принять заявку' }))
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Решение по заявке' })).toBeNull())
    expect(screen.getByText('Делает сводку')).toBeTruthy()
  })

  it('does not show the panel to a developer for a decided request', async () => {
    useSessionStore.getState().signIn('t', developer)
    api((c) =>
      c.path === `/portal/requests/${ID}`
        ? json({ ...requestFixture, status: { code: 'rejected', label: 'Отклонена' }, rejectReason: 'Дубль' })
        : undefined
    )
    renderAt(`/requests/${ID}`)
    expect(await screen.findByText('Дубль')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Решение по заявке' })).toBeNull()
  })

  it('a direct link without a session leads to login and returns to the request', async () => {
    useSessionStore.getState().signOut()
    api((c) => {
      if (c.path === '/auth/login') return json({ accessToken: 't', expiresIn: 900, mustChangePassword: false })
      if (c.path === '/auth/me') return json(employee)
      if (c.path === `/portal/requests/${ID}`) return json(requestFixture)
    })
    renderAt(`/requests/${ID}`)
    await userEvent.type(await screen.findByLabelText('Логин'), 'ivan')
    await userEvent.type(screen.getByLabelText('Пароль'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByRole('heading', { name: 'Сверка актов' })).toBeTruthy()
  })

  it('shows the full name of the author instead of the login to the developer', async () => {
    useSessionStore.getState().signIn('t', developer)
    api((c) => (c.path === `/portal/requests/${ID}` ? json({ ...requestFixture, author: { id: 'u2', login: 'nikitina', fullName: 'Никитина Анна Сергеевна' } }) : undefined))
    renderAt(`/requests/${ID}`)
    await screen.findByRole('heading', { name: 'Сверка актов' })
    expect(screen.getAllByText(/Никитина Анна Сергеевна/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/nikitina/)).toBeNull()
  })

  it('shows the login of an author without the full name', async () => {
    useSessionStore.getState().signIn('t', developer)
    api((c) => (c.path === `/portal/requests/${ID}` ? json({ ...requestFixture, author: { id: 'u3', login: 'user10', fullName: 'user10' } }) : undefined))
    renderAt(`/requests/${ID}`)
    await screen.findByRole('heading', { name: 'Сверка актов' })
    expect(screen.getAllByText(/user10/).length).toBeGreaterThan(0)
  })
})

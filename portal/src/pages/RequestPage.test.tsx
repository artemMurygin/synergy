import { cleanup, render, screen, within } from '@testing-library/react'
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
    if (c.path === '/portal/catalog') return json({ products: [] })
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

  it('shows who took the request once, inside the decision panel', async () => {
    useSessionStore.getState().signIn('t', developer)
    api((c) => (c.path === `/portal/requests/${ID}` ? json(requestFixture) : undefined))
    renderAt(`/requests/${ID}`)
    await screen.findByRole('heading', { name: 'Решение по заявке' })
    const panel = screen.getByTestId('decision-panel')
    expect(within(panel).getAllByText(/В работе у/)).toHaveLength(1)
    expect(screen.getAllByText(/^В работе у /)).toHaveLength(1)
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
    await user.type(screen.getByLabelText(/Оценка трудозатрат/), '12')
    await user.selectOptions(await screen.findByLabelText('Навык'), 's1')
    await user.click(screen.getByRole('button', { name: 'Принять заявку' }))
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Решение по заявке' })).toBeNull())
    expect(screen.getByText('Делает сводку')).toBeTruthy()
  })

  describe('developer, request not yet taken', () => {
    const fresh = { ...requestFixture, status: { code: 'new' as const, label: 'Новая' }, reviewer: null, takenAt: null }

    it('offers only "Взять в работу" for a new request', async () => {
      useSessionStore.getState().signIn('t', developer)
      api((c) => (c.path === `/portal/requests/${ID}` ? json(fresh) : undefined))
      renderAt(`/requests/${ID}`)
      expect(await screen.findByRole('button', { name: 'Взять в работу' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Принять|Отклонить/ })).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Решение по заявке' })).toBeNull()
    })

    it('does not offer taking to the author', async () => {
      useSessionStore.getState().signIn('t', employee)
      api((c) => (c.path === `/portal/requests/${ID}` ? json(fresh) : undefined))
      renderAt(`/requests/${ID}`)
      await screen.findByRole('heading', { name: 'Сверка актов' })
      expect(screen.queryByRole('button', { name: 'Взять в работу' })).toBeNull()
    })

    it('after taking shows "На рассмотрении", the reviewer and the decision panel without a reload', async () => {
      useSessionStore.getState().signIn('t', developer)
      let taken = false
      api((c) => {
        if (c.method === 'POST' && c.path === `/portal/requests/${ID}/take`) {
          taken = true
          return json(requestFixture)
        }
        if (c.path === `/portal/requests/${ID}`) return json(taken ? requestFixture : fresh)
      })
      renderAt(`/requests/${ID}`)
      await userEvent.click(await screen.findByRole('button', { name: 'Взять в работу' }))
      expect(await screen.findByRole('heading', { name: 'Решение по заявке' })).toBeTruthy()
      expect(screen.getAllByText('На рассмотрении').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Петров Пётр/).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: 'Взять в работу' })).toBeNull()
    })

    it('on 409 "already taken" shows the request under review with the reviewer and an Alert above the panel', async () => {
      useSessionStore.getState().signIn('t', developer)
      let taken = false
      api((c) => {
        if (c.method === 'POST' && c.path === `/portal/requests/${ID}/take`) {
          taken = true
          return json({ message: 'Заявку уже взяли', code: 'PORTAL_REQUEST_ALREADY_TAKEN' }, 409)
        }
        if (c.path === `/portal/requests/${ID}`) return json(taken ? requestFixture : fresh)
      })
      renderAt(`/requests/${ID}`)
      await userEvent.click(await screen.findByRole('button', { name: 'Взять в работу' }))
      expect(await screen.findByRole('heading', { name: 'Решение по заявке' })).toBeTruthy()
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Заявку уже взяли в работу')
      expect(alert.textContent).toContain('Петров Пётр')
    })
  })

  it('on 409 "already decided" shows a notice for the decided request', async () => {
    useSessionStore.getState().signIn('t', developer)
    let attempted = false
    const rejected = { ...requestFixture, status: { code: 'rejected', label: 'Отклонена' }, rejectReason: 'Дубль' }
    api((c) => {
      if (c.method === 'POST' && c.path === `/portal/requests/${ID}/take`) {
        attempted = true
        return json({ message: 'Решение уже принято', code: 'PORTAL_REQUEST_ALREADY_DECIDED' }, 409)
      }
      if (c.path === `/portal/requests/${ID}`) return json(attempted ? rejected : { ...requestFixture, status: { code: 'new', label: 'Новая' }, reviewer: null })
    })
    renderAt(`/requests/${ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Взять в работу' }))
    expect(await screen.findByText('Дубль')).toBeTruthy()
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toContain('уже принято решение')
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

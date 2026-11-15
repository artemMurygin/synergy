import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth, useSessionStore } from '@/features/auth'
import { catalogFixture } from '@/features/catalog/model/catalog.fixtures'
import { bugFixture } from '@/features/bugs/model/bugs.fixtures'
import type { Profile } from '@/lib/schemas'
import { createTestClient, json, queryWrapper, stubFetch, type FetchCall } from '@/test/helpers'
import { BugPage } from './BugPage'
import { LoginPage } from './LoginPage'

const employee: Profile = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null }
const developer: Profile = { ...employee, login: 'dev', roles: ['developer'] }
const ID = bugFixture.id
const bugWithAgentInCatalog = { ...bugFixture, agent: { id: 'a-assistant', name: 'Ассистент' } }

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
            <Route path="/bugs" element={<p>bugs-page</p>} />
            <Route path="/bugs/:id" element={<BugPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

function api(handler: (c: FetchCall) => Response | undefined) {
  return stubFetch((c) => {
    if (c.path === '/portal/catalog') return json(catalogFixture)
    if (c.path.endsWith('/comments')) return json({ items: [] })
    return handler(c) ?? json({}, 404)
  })
}

describe('BugPage', () => {
  it('shows the bug with the agent link and the comments feed of subject bugs, without actions for the author', async () => {
    useSessionStore.getState().signIn('t', employee)
    const { calls } = api((c) => (c.path === `/portal/bugs/${ID}` ? json({ ...bugWithAgentInCatalog, nextStatuses: [] }) : undefined))
    renderAt(`/bugs/${ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Ассистент не отвечает' })).toBeTruthy()
    expect(await screen.findByRole('link', { name: /Ассистент/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Комментарии/ })).toBeTruthy()
    expect(calls.some((c) => c.path === `/portal/bugs/${ID}/comments`)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Взять в работу' })).toBeNull()
  })

  it('shows the actions to a developer and the new status after the change', async () => {
    useSessionStore.getState().signIn('t', developer)
    let taken = false
    const inWork = { ...bugFixture, status: 'in_progress' as const, nextStatuses: ['resolved' as const, 'wont_fix' as const, 'open' as const] }
    api((c) => {
      if (c.method === 'POST' && c.path === `/portal/bugs/${ID}/status`) {
        taken = true
        return json(inWork)
      }
      if (c.path === `/portal/bugs/${ID}`) return json(taken ? inWork : { ...bugFixture, nextStatuses: ['in_progress', 'wont_fix'] })
    })
    renderAt(`/bugs/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Взять в работу' }))
    expect(await screen.findByRole('button', { name: 'Исправлен' })).toBeTruthy()
    expect(screen.getAllByText('В работе').length).toBeGreaterThan(0)
  })

  it.each([
    ['a missing or foreign bug (404)', ID],
    ['a malformed id', 'not-an-id']
  ])('shows "Обращение не найдено" with a link to the support for %s', async (_name, id) => {
    useSessionStore.getState().signIn('t', employee)
    api(() => json({ message: 'Bug not found' }, 404))
    renderAt(`/bugs/${id}`)
    expect(await screen.findByRole('heading', { name: 'Обращение не найдено' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Поддержка' }).getAttribute('href')).toBe('/bugs')
    expect(screen.queryByText(/Bug not found/)).toBeNull()
  })

  it('shows a retry for a server failure', async () => {
    useSessionStore.getState().signIn('t', employee)
    api(() => json({ message: 'boom' }, 500))
    renderAt(`/bugs/${ID}`)
    expect(await screen.findByRole('button', { name: 'Повторить' }, { timeout: 4000 })).toBeTruthy()
  })

  it('a direct link without a session leads to login and returns to the bug', async () => {
    useSessionStore.getState().signOut()
    api((c) => {
      if (c.path === '/auth/login') return json({ accessToken: 't', expiresIn: 900, mustChangePassword: false })
      if (c.path === '/auth/me') return json(employee)
      if (c.path === `/portal/bugs/${ID}`) return json(bugFixture)
    })
    renderAt(`/bugs/${ID}`)
    await userEvent.type(await screen.findByLabelText('Логин'), 'ivan')
    await userEvent.type(screen.getByLabelText('Пароль'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ассистент не отвечает' })).toBeTruthy()
  })
})

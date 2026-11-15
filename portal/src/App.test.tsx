import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useSessionStore } from '@/features/auth'
import type { Profile } from '@/lib/schemas'
import { createTestClient, json, page, stubFetch, type FetchCall } from '@/test/helpers'

const employee: Profile = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null }
const developer: Profile = { ...employee, login: 'dev', roles: ['developer'] }
const admin: Profile = { ...employee, login: 'adm', roles: ['admin'] }
const tokens = { accessToken: 't', expiresIn: 900, mustChangePassword: false }

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Renders the whole app at `path`; `profile` null means there is no session to restore. */
function renderApp(path: string, profile: Profile | null, extra: (c: FetchCall) => Response | undefined = () => undefined) {
  const stub = stubFetch((c) => {
    if (c.path === '/auth/refresh') return profile ? json(tokens) : json({ message: 'no session' }, 401)
    if (c.path === '/auth/me') return json(profile)
    const custom = extra(c)
    if (custom) return custom
    if (c.path.startsWith('/portal/')) return json(page([]))
    return json({}, 404)
  })
  render(<App queryClient={createTestClient()} initialEntries={[path]} />)
  return stub
}

describe('routing', () => {
  it('the home page leads to "Мои заявки"', async () => {
    renderApp('/', employee)
    expect(await screen.findByRole('heading', { name: 'Мои заявки' })).toBeTruthy()
  })

  it.each([
    ['/requests', 'Мои заявки'],
    ['/ideas/new', 'Новая идея'],
    ['/requests/3f0c2d9e-7a31-4c55-9a52-1f6d8b0e4a11', 'Заявка не найдена']
  ])('the protected route %s opens for a signed-in user', async (path, heading) => {
    renderApp(path, employee, (c) => (c.path.startsWith('/portal/requests/3f0') ? json({}, 404) : undefined))
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Разделы' })).toBeTruthy()
  })

  it.each(['/requests', '/ideas/new', '/queue', '/skills'])('%s without a session shows the login screen', async (path) => {
    renderApp(path, null)
    expect(await screen.findByRole('heading', { name: 'Вход в портал' })).toBeTruthy()
  })

  it('/login opens the login screen', async () => {
    renderApp('/login', null)
    expect(await screen.findByRole('heading', { name: 'Вход в портал' })).toBeTruthy()
  })

  it('a temporary password leads to /change-password before other sections', async () => {
    renderApp('/requests', { ...employee, mustChangePassword: true })
    expect(await screen.findByRole('heading', { name: 'Смена временного пароля' })).toBeTruthy()
  })

  it('an employee without the role opening /queue sees "Мои заявки" and the queue is not requested', async () => {
    const { calls } = renderApp('/queue', employee)
    expect(await screen.findByRole('heading', { name: 'Мои заявки' })).toBeTruthy()
    expect(calls.some((c) => c.path === '/portal/queue')).toBe(false)
  })

  it('an employee without the role opening /skills sees "Мои заявки"', async () => {
    const { calls } = renderApp('/skills', employee)
    expect(await screen.findByRole('heading', { name: 'Мои заявки' })).toBeTruthy()
    expect(calls.some((c) => c.path === '/portal/skills')).toBe(false)
  })

  it('a developer opens /queue and /skills', async () => {
    renderApp('/queue', developer)
    expect(await screen.findByRole('heading', { name: 'Очередь заявок' })).toBeTruthy()
    cleanup()
    renderApp('/skills', developer, (c) => (c.path === '/portal/agents' ? json([]) : undefined))
    expect(await screen.findByRole('heading', { name: 'Навыки' })).toBeTruthy()
  })

  it('an unknown path shows the not-found page', async () => {
    renderApp('/no/such/page', employee)
    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Мои заявки' }).length).toBeGreaterThan(0)
  })

  it.each(['/admin/employees', '/admin/employees/new', '/admin/employees/e1', '/admin/departments'])(
    'an employee without the role opening %s sees "Мои заявки" and no admin data is requested',
    async (path) => {
      const { calls } = renderApp(path, employee)
      expect(await screen.findByRole('heading', { name: 'Мои заявки' })).toBeTruthy()
      expect(calls.some((c) => c.path.startsWith('/admin/'))).toBe(false)
    }
  )

  it('a developer without the admin role opening /admin/employees sees "Мои заявки"', async () => {
    const { calls } = renderApp('/admin/employees', developer)
    expect(await screen.findByRole('heading', { name: 'Мои заявки' })).toBeTruthy()
    expect(calls.some((c) => c.path.startsWith('/admin/'))).toBe(false)
  })

  it('an administrator opens the employees, the creation form, the card and the departments', async () => {
    const api = (c: FetchCall) => {
      if (c.path === '/admin/departments') return json([])
      if (c.path === '/admin/employees') return json(page([]))
      if (c.path === '/admin/employees/e1') return json({ id: 'e1', login: 'ivanov', lastName: 'Иванов', firstName: 'Иван', middleName: null, fullName: 'Иванов Иван', department: null, position: null, email: null, scrmEmployeeId: null, roles: [], isActive: true })
      return undefined
    }
    renderApp('/admin/employees', admin, api)
    expect(await screen.findByRole('heading', { name: 'Сотрудники' })).toBeTruthy()
    cleanup()
    renderApp('/admin/employees/new', admin, api)
    expect(await screen.findByRole('heading', { name: 'Новый сотрудник' })).toBeTruthy()
    cleanup()
    renderApp('/admin/employees/e1', admin, api)
    expect(await screen.findByRole('heading', { level: 1, name: 'Иванов Иван' })).toBeTruthy()
    cleanup()
    renderApp('/admin/departments', admin, api)
    expect(await screen.findByRole('heading', { name: 'Отделы' })).toBeTruthy()
  })

  it('an administrator without the developer role opening /queue sees "Мои заявки"', async () => {
    const { calls } = renderApp('/queue', admin)
    expect(await screen.findByRole('heading', { name: 'Мои заявки' })).toBeTruthy()
    expect(calls.some((c) => c.path === '/portal/queue')).toBe(false)
  })
})

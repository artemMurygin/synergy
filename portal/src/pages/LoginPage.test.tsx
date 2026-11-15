import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { LoginPage } from './LoginPage'

beforeEach(() => {
  useSessionStore.getState().signOut()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const tokens = { accessToken: 't', expiresIn: 900, mustChangePassword: false }
const profile = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null }

function renderLogin(entry: string | { pathname: string; state?: unknown } = '/login') {
  const Wrapper = queryWrapper(createTestClient())
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/requests" element={<p>requests-page</p>} />
          <Route path="/requests/:id" element={<p>request-page</p>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

async function fill(login: string, password: string) {
  await userEvent.type(screen.getByLabelText('Логин'), login)
  await userEvent.type(screen.getByLabelText('Пароль'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
}

function authRoutes(loginResponse: Response) {
  return stubFetch((c) => {
    if (c.path === '/auth/login') return loginResponse
    if (c.path === '/auth/me') return json(profile)
    return json({}, 404)
  })
}

describe('LoginPage', () => {
  it('has labelled login and password fields', () => {
    renderLogin()
    expect(screen.getByLabelText('Логин')).toBeTruthy()
    expect((screen.getByLabelText('Пароль') as HTMLInputElement).type).toBe('password')
  })

  it('does not send empty fields and marks them', async () => {
    const { calls } = authRoutes(json(tokens))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(calls).toHaveLength(0)
    expect(screen.getByLabelText('Логин').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Пароль').getAttribute('aria-invalid')).toBe('true')
  })

  it('wrong credentials show an error and keep the user on /login', async () => {
    authRoutes(json({ code: 'INVALID_CREDENTIALS', message: 'x' }, 401))
    renderLogin()
    await fill('ivan', 'bad')
    expect((await screen.findByRole('alert')).textContent).toContain('Неверный логин или пароль')
    expect(screen.queryByText('requests-page')).toBeNull()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeTruthy()
  })

  it('an unreachable server shows a different message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))))
    renderLogin()
    await fill('ivan', 'pw')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Сервер недоступен')
    expect(alert.textContent).not.toContain('Неверный логин')
  })

  it('a successful login opens "Мои заявки"', async () => {
    authRoutes(json(tokens))
    renderLogin()
    await fill('ivan', 'pw')
    expect(await screen.findByText('requests-page')).toBeTruthy()
  })

  it('a successful login returns to the requested address', async () => {
    authRoutes(json(tokens))
    renderLogin({ pathname: '/login', state: { from: { pathname: '/requests/abc', search: '', hash: '' } } })
    await fill('ivan', 'pw')
    expect(await screen.findByText('request-page')).toBeTruthy()
  })
})

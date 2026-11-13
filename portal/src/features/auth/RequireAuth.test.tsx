import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/lib/schemas'
import { RequireAuth, returnToFrom } from './RequireAuth'
import { useSessionStore } from './model/session.store'

const user: Profile = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [] }

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <button
      onClick={() => {
        useSessionStore.getState().signIn('t', user)
        void navigate(returnToFrom(location.state), { replace: true })
      }}
    >
      login-page
    </button>
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/change-password" element={<p>change-password-page</p>} />
          <Route path="/requests" element={<p>requests-page</p>} />
          <Route path="/queue" element={<p>queue-page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RequireAuth', () => {
  it('shows the restoring state, not the login screen, while the session is restored', () => {
    renderAt('/requests')
    expect(screen.getByRole('status', { name: 'Восстанавливаем сессию' })).toBeTruthy()
    expect(screen.getByText('Открываем портал')).toBeTruthy()
    expect(screen.queryByText('login-page')).toBeNull()
    expect(screen.queryByText('requests-page')).toBeNull()
  })

  it('shows the unavailable message with a retry instead of the login screen', async () => {
    useSessionStore.getState().markUnavailable()
    renderAt('/requests')
    expect(screen.getByText('Сервер недоступен')).toBeTruthy()
    expect(screen.queryByText('login-page')).toBeNull()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
  })

  it('retry restarts the session restoration', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('network')))
    vi.stubGlobal('fetch', fetchMock)
    useSessionStore.getState().markUnavailable()
    renderAt('/requests')
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(fetchMock).toHaveBeenCalled()
  })

  it('redirects a signed-out visitor to /login and returns to the requested address after login', async () => {
    useSessionStore.getState().signOut()
    renderAt('/queue?page=2')
    await userEvent.click(screen.getByText('login-page'))
    expect(await screen.findByText('queue-page')).toBeTruthy()
  })

  it('opens the page when the user is signed in', () => {
    useSessionStore.getState().signIn('t', user)
    renderAt('/requests')
    expect(screen.getByText('requests-page')).toBeTruthy()
  })

  it('sends a user with mustChangePassword to /change-password before other sections', () => {
    useSessionStore.getState().signIn('t', { ...user, mustChangePassword: true })
    renderAt('/requests')
    expect(screen.getByText('change-password-page')).toBeTruthy()
    expect(screen.queryByText('requests-page')).toBeNull()
  })

  it('lets a user with mustChangePassword stay on /change-password', () => {
    useSessionStore.getState().signIn('t', { ...user, mustChangePassword: true })
    renderAt('/change-password')
    expect(screen.getByText('change-password-page')).toBeTruthy()
  })

  it('reacts when the session is lost while a page is open', () => {
    useSessionStore.getState().signIn('t', user)
    renderAt('/requests')
    act(() => useSessionStore.getState().signOut())
    expect(screen.getByText('login-page')).toBeTruthy()
  })

  it('renders children when used as a wrapper', () => {
    useSessionStore.getState().signIn('t', user)
    render(
      <MemoryRouter>
        <RequireAuth>
          <p>wrapped</p>
        </RequireAuth>
      </MemoryRouter>
    )
    expect(screen.getByText('wrapped')).toBeTruthy()
  })
})

describe('returnToFrom', () => {
  it('uses the remembered path, search and hash', () => {
    expect(returnToFrom({ from: { pathname: '/queue', search: '?a=1', hash: '#x' } })).toBe('/queue?a=1#x')
  })

  it('falls back to my requests for missing or foreign addresses', () => {
    expect(returnToFrom(null)).toBe('/requests')
    expect(returnToFrom({})).toBe('/requests')
    expect(returnToFrom({ from: { pathname: '//evil.example', search: '', hash: '' } })).toBe('/requests')
    expect(returnToFrom({ from: { pathname: '/login', search: '', hash: '' } })).toBe('/requests')
  })
})

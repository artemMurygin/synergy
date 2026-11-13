import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/lib/schemas'
import { RequireRole } from './RequireRole'
import { useSessionStore } from './model/session.store'

const employee: Profile = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [] }
const developer: Profile = { ...employee, roles: ['developer'] }

const queueFetch = vi.fn()
function QueueData() {
  useEffect(() => {
    queueFetch()
  }, [])
  return <p>queue-page</p>
}

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={['/queue']}>
      <Routes>
        <Route element={<RequireRole role="developer" />}>
          <Route path="/queue" element={<QueueData />} />
        </Route>
        <Route path="/requests" element={<p>requests-page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  queueFetch.mockClear()
})
afterEach(cleanup)

describe('RequireRole', () => {
  it('shows the section to a developer', () => {
    useSessionStore.getState().signIn('t', developer)
    renderQueue()
    expect(screen.getByText('queue-page')).toBeTruthy()
  })

  it('redirects an employee without the role to my requests and never mounts the section', () => {
    useSessionStore.getState().signIn('t', employee)
    renderQueue()
    expect(screen.getByText('requests-page')).toBeTruthy()
    expect(screen.queryByText('queue-page')).toBeNull()
    expect(queueFetch).not.toHaveBeenCalled()
  })

  it('renders nothing for the section before the session is signed in', () => {
    renderQueue()
    expect(screen.queryByText('queue-page')).toBeNull()
    expect(screen.queryByText('requests-page')).toBeNull()
    expect(queueFetch).not.toHaveBeenCalled()
  })

  it('renders children when used as a wrapper', () => {
    useSessionStore.getState().signIn('t', developer)
    render(
      <MemoryRouter>
        <RequireRole role="developer">
          <p>wrapped</p>
        </RequireRole>
      </MemoryRouter>
    )
    expect(screen.getByText('wrapped')).toBeTruthy()
  })
})

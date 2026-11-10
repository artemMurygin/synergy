import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionSnapshotView } from '../../../../preload/auth-bridge'
import { AuthGate } from './AuthGate'
import { authenticatedSnapshot, createWrapper, installBridgeMock, unauthenticatedSnapshot } from './auth-test-utils'
import { useSessionStore } from './session.store'

afterEach(() => {
  cleanup()
  useSessionStore.setState({ snapshot: { state: 'restoring', user: null } })
})

function mount(initial: SessionSnapshotView) {
  const mock = installBridgeMock(initial)
  const Wrapper = createWrapper()
  render(
    <Wrapper>
      <AuthGate>
        <p>protected chats</p>
      </AuthGate>
    </Wrapper>
  )
  return mock
}

describe('AuthGate', () => {
  it('shows the restoring screen while the session is being restored', () => {
    const mock = installBridgeMock(unauthenticatedSnapshot)
    mock.getState.mockReturnValue(new Promise(() => undefined))
    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <AuthGate>
          <p>protected chats</p>
        </AuthGate>
      </Wrapper>
    )
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('protected chats')).toBeNull()
  })

  it('shows the login form without rendering children when unauthenticated', async () => {
    mount(unauthenticatedSnapshot)
    expect(await screen.findByRole('button', { name: /войти/i })).toBeTruthy()
    expect(screen.queryByText('protected chats')).toBeNull()
  })

  it('passes the snapshot warning to the login form', async () => {
    mount({ state: 'unauthenticated', user: null, warning: 'Сервер недоступен' })
    expect(await screen.findByText('Сервер недоступен')).toBeTruthy()
  })

  it('shows the change password dialog without children when a password change is required', async () => {
    mount({ state: 'mustChangePassword', user: { id: 'u1', login: 'admin' } })
    expect(await screen.findByRole('button', { name: 'Сменить пароль' })).toBeTruthy()
    expect(screen.queryByText('protected chats')).toBeNull()
  })

  it('shows the connection error and retries the restore', async () => {
    const mock = mount({ state: 'connectionError', user: null })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /повторить/i }))
    expect(mock.retryRestore).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('protected chats')).toBeNull()
  })

  it('renders children when authenticated', async () => {
    mount(authenticatedSnapshot)
    expect(await screen.findByText('protected chats')).toBeTruthy()
  })

  it('replaces children with the login form when the session is lost', async () => {
    const mock = mount(authenticatedSnapshot)
    await screen.findByText('protected chats')
    act(() => mock.emit(unauthenticatedSnapshot))
    await waitFor(() => {
      expect(screen.queryByText('protected chats')).toBeNull()
    })
    expect(screen.getByRole('button', { name: /войти/i })).toBeTruthy()
  })
})

import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    expect(await screen.findByText(/Сервер недоступен/)).toBeTruthy()
  })

  it('shows the rate-limit block with a countdown after a 429 and unlocks the form when it ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const mock = mount(unauthenticatedSnapshot)
      mock.login.mockResolvedValue({ ok: false, code: 'RATE_LIMITED', retryAfterSec: 3 })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await user.type(await screen.findByPlaceholderText('Введите логин'), 'admin')
      await user.type(screen.getByPlaceholderText('Введите пароль'), 'secret')
      await user.click(screen.getByRole('button', { name: 'Войти' }))
      expect(await screen.findByText('Слишком много попыток входа')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Повторить через 0:03/ }).hasAttribute('disabled')).toBe(true)
      expect(screen.getByRole('button', { name: 'Войти' }).hasAttribute('disabled')).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(screen.getByRole('button', { name: /Повторить через 0:02/ })).toBeTruthy()
      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
      expect(screen.queryByText('Слишком много попыток входа')).toBeNull()
      expect(screen.getByRole('button', { name: 'Войти' }).hasAttribute('disabled')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('tells that the new password must differ from the temporary one', async () => {
    mount({ state: 'mustChangePassword', user: { id: 'u1', login: 'admin' } })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Временный пароль'), 'Temp123456')
    await user.type(screen.getByLabelText('Новый пароль'), 'Temp123456')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'Temp123456')
    await user.click(screen.getByRole('button', { name: 'Сменить пароль' }))
    expect(await screen.findByText('Новый пароль не должен совпадать с временным')).toBeTruthy()
  })

  it('shows the generic rate-limit message when a 429 has no retry delay', async () => {
    const mock = mount(unauthenticatedSnapshot)
    mock.login.mockResolvedValue({ ok: false, code: 'RATE_LIMITED' })
    const user = userEvent.setup()
    await user.type(await screen.findByPlaceholderText('Введите логин'), 'admin')
    await user.type(screen.getByPlaceholderText('Введите пароль'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByText(/Слишком много попыток входа/)).toBeTruthy()
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
    act(() => { mock.emit(unauthenticatedSnapshot); })
    await waitFor(() => {
      expect(screen.queryByText('protected chats')).toBeNull()
    })
    expect(screen.getByRole('button', { name: /войти/i })).toBeTruthy()
  })
})

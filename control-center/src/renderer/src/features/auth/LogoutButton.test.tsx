import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createWrapper, installBridgeMock, authenticatedSnapshot } from './auth-test-utils'
import { AuthGate } from './AuthGate'
import { LogoutButton } from './LogoutButton'
import { AccountMenu } from './AccountMenu'
import { useSessionStore } from './session.store'

afterEach(() => {
  cleanup()
  useSessionStore.setState({ snapshot: { state: 'restoring', user: null } })
})

describe('LogoutButton', () => {
  it('calls logout on click', async () => {
    const mock = installBridgeMock(authenticatedSnapshot)
    mock.logout.mockResolvedValue({ serverRevoked: true })
    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <LogoutButton />
      </Wrapper>
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Выйти' }))
    await waitFor(() => {
      expect(mock.logout).toHaveBeenCalledTimes(1)
    })
  })

  it('shows the warning on the login screen after an offline logout', async () => {
    const mock = installBridgeMock(authenticatedSnapshot)
    const warning = 'Сервер недоступен, сессия на сервере не отозвана'
    mock.logout.mockImplementation(async () => {
      act(() => mock.emit({ state: 'unauthenticated', user: null, warning }))
      return { serverRevoked: false }
    })
    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <AuthGate>
          <LogoutButton />
        </AuthGate>
      </Wrapper>
    )
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Выйти' }))
    expect(await screen.findByText(warning)).toBeTruthy()
    expect(screen.getByText('Выход выполнен только на этом компьютере')).toBeTruthy()
  })
})

describe('AccountMenu', () => {
  it('opens the account card with the login and the logout button', async () => {
    const mock = installBridgeMock(authenticatedSnapshot)
    mock.logout.mockResolvedValue({ serverRevoked: true })
    useSessionStore.setState({ snapshot: authenticatedSnapshot })
    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <AccountMenu />
      </Wrapper>
    )
    const user = userEvent.setup()
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Учётная запись admin' }))
    expect(screen.getByText('admin')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    await waitFor(() => expect(mock.logout).toHaveBeenCalledTimes(1))
  })

  it('renders nothing without a session', () => {
    installBridgeMock(authenticatedSnapshot)
    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <AccountMenu />
      </Wrapper>
    )
    expect(container.querySelector('button')).toBeNull()
  })
})

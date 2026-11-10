import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createWrapper, installBridgeMock, authenticatedSnapshot } from './auth-test-utils'
import { AuthGate } from './AuthGate'
import { LogoutButton } from './LogoutButton'
import { SidebarFooter } from './SidebarFooter'
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
          <SidebarFooter />
        </AuthGate>
      </Wrapper>
    )
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Выйти' }))
    expect(await screen.findByText(warning)).toBeTruthy()
    expect(screen.getByText('Выход выполнен только на этом компьютере')).toBeTruthy()
  })
})

describe('SidebarFooter', () => {
  it('shows the login of the current user and the logout button', () => {
    installBridgeMock(authenticatedSnapshot)
    useSessionStore.setState({ snapshot: authenticatedSnapshot })
    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <SidebarFooter />
      </Wrapper>
    )
    expect(screen.getByText('admin')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeTruthy()
  })
})

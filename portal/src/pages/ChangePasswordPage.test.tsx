import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { ChangePasswordPage } from './ChangePasswordPage'

const temp = { id: 'u1', login: 'ivan', mustChangePassword: true, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null }

beforeEach(() => {
  useSessionStore.getState().signIn('t', temp)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  const Wrapper = queryWrapper(createTestClient())
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/requests" element={<p>requests-page</p>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

async function fill(current: string, next: string, repeat: string) {
  await userEvent.type(screen.getByLabelText('Временный пароль'), current)
  await userEvent.type(screen.getByLabelText('Новый пароль'), next)
  await userEvent.type(screen.getByLabelText('Повторите пароль'), repeat)
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить и войти' }))
}

describe('ChangePasswordPage', () => {
  it('rejects a mismatch without calling the server', async () => {
    const { calls } = stubFetch(() => json({}))
    renderPage()
    await fill('temp', 'newpass1', 'other')
    expect(calls).toHaveLength(0)
    expect(screen.getByText('Пароли не совпадают')).toBeTruthy()
    expect(screen.getByLabelText('Повторите пароль').getAttribute('aria-invalid')).toBe('true')
  })

  it('rejects a new password equal to the temporary one', async () => {
    const { calls } = stubFetch(() => json({}))
    renderPage()
    await fill('same-pass', 'same-pass', 'same-pass')
    expect(calls).toHaveLength(0)
    expect(screen.getByText('Новый пароль должен отличаться от временного')).toBeTruthy()
  })

  it('changes the password and opens "Мои заявки"', async () => {
    const { calls } = stubFetch((c) => {
      if (c.path === '/auth/change-password') return json({ accessToken: 't2', expiresIn: 900, mustChangePassword: false })
      if (c.path === '/auth/me') return json({ ...temp, mustChangePassword: false })
      return json({}, 404)
    })
    renderPage()
    await fill('temp', 'newpass1', 'newpass1')
    expect(await screen.findByText('requests-page')).toBeTruthy()
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/change-password', body: { currentPassword: 'temp', newPassword: 'newpass1' } })
    expect(useSessionStore.getState().profile?.mustChangePassword).toBe(false)
  })

  it('shows the server message when the temporary password is wrong', async () => {
    stubFetch(() => json({ code: 'INVALID_CREDENTIALS', message: 'Неверный пароль' }, 400))
    renderPage()
    await fill('bad', 'newpass1', 'newpass1')
    expect((await screen.findByRole('alert')).textContent).toContain('Неверный пароль')
    expect(screen.queryByText('requests-page')).toBeNull()
  })

  it('an unreachable server shows its own message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))))
    renderPage()
    await fill('temp', 'newpass1', 'newpass1')
    expect((await screen.findByRole('alert')).textContent).toContain('Сервер недоступен')
  })
})

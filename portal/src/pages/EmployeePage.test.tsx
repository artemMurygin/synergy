import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { adminEmployeeFixture, dismissedEmployeeFixture, employeeFixture, noNameEmployeeFixture } from '@/features/employees/model/employees.fixtures'
import { departmentFixture } from '@/features/departments/model/fixtures'
import type { Employee } from '@/features/employees'
import { createTestClient, json, queryWrapper, stubFetch, type FetchCall } from '@/test/helpers'
import { EmployeePage } from './EmployeePage'

const admin = { id: 'e2', login: 'akotova', mustChangePassword: false, roles: ['admin' as const], fullName: 'Котова Анна Сергеевна', lastName: 'Котова', firstName: 'Анна', middleName: 'Сергеевна', position: null, department: null }

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', admin)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage(id = 'e1', state?: unknown) {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter initialEntries={[{ pathname: `/admin/employees/${id}`, state }]}>
        <Routes>
          <Route path="/admin/employees" element={<p>list-page</p>} />
          <Route path="/admin/employees/:id" element={<EmployeePage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

/** A tiny server: the card lives in `state` and the write calls change it. */
function server(initial: Employee, write: (c: FetchCall, state: { current: Employee }) => Response | undefined = () => undefined) {
  const state = { current: initial }
  return stubFetch((c) => {
    if (c.path === '/admin/departments') return json([departmentFixture])
    const custom = write(c, state)
    if (custom) return custom
    if (c.path === `/admin/employees/${state.current.id}` && c.method === 'GET') return json(state.current)
    return json({ message: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' }, 404)
  })
}

describe('EmployeePage', () => {
  it('shows the profile: name, status, meta line, the read-only login and the roles', async () => {
    server(employeeFixture)
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Иванов Иван Петрович' })).toBeTruthy()
    expect(screen.getByText('Активен')).toBeTruthy()
    expect(screen.getByText('ivanov · Бухгалтер · Бухгалтерия')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Сотрудники/ }).getAttribute('href')).toBe('/admin/employees')
    const login = screen.getByLabelText(/^Логин/) as HTMLInputElement
    expect(login.value).toBe('ivanov')
    expect(login.readOnly).toBe(true)
    expect((screen.getByLabelText(/^Фамилия/) as HTMLInputElement).value).toBe('Иванов')
    expect((screen.getByRole('checkbox', { name: /Разработчик/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Администратор/ }) as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByRole('button', { name: /удалить/i })).toBeNull()
  })

  it('shows the success notice after the employee was created, and no notice otherwise', async () => {
    server(employeeFixture)
    renderPage('e1', { created: true })
    expect(await screen.findByRole('heading', { level: 1, name: 'Иванов Иван Петрович' })).toBeTruthy()
    expect(screen.getByText('Сотрудник создан').closest('[role="status"]')).toBeTruthy()
    cleanup()
    renderPage('e1')
    await screen.findByRole('heading', { level: 1, name: 'Иванов Иван Петрович' })
    expect(screen.queryByText('Сотрудник создан')).toBeNull()
  })

  it('shows the loading state', () => {
    stubFetch(() => new Promise<Response>(() => undefined) as unknown as Response)
    renderPage()
    expect(within(screen.getByRole('status')).getByText('Загружаем карточку…')).toBeTruthy()
  })

  it('shows "Сотрудник не найден" with a link to the list for a 404', async () => {
    server(employeeFixture)
    renderPage('missing')
    expect(await screen.findByRole('heading', { name: 'Сотрудник не найден' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'К списку сотрудников' }).getAttribute('href')).toBe('/admin/employees')
    expect(screen.queryByText(/EMPLOYEE_NOT_FOUND/)).toBeNull()
  })

  it('shows an error with a retry for a server failure', async () => {
    let fail = true
    stubFetch((c) => {
      if (c.path === '/admin/departments') return json([])
      return fail ? json({ message: 'boom' }, 500) : json(employeeFixture)
    })
    renderPage()
    expect(await screen.findByText('Не удалось загрузить карточку')).toBeTruthy()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Иванов Иван Петрович' })).toBeTruthy()
  })

  it('saves the profile and shows the new value', async () => {
    const { calls } = server(employeeFixture, (c, state) => {
      if (c.method === 'PATCH') {
        state.current = { ...state.current, position: 'Главный бухгалтер' }
        return json(state.current)
      }
      return undefined
    })
    renderPage()
    const position = await screen.findByLabelText(/^Должность/)
    await userEvent.clear(position)
    await userEvent.type(position, 'Главный бухгалтер')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Изменения сохранены')).toBeTruthy()
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ position: 'Главный бухгалтер' })
    expect(await screen.findByText('ivanov · Главный бухгалтер · Бухгалтерия')).toBeTruthy()
  })

  it('keeps the typed values and shows the taken email at the field', async () => {
    server(employeeFixture, (c) => (c.method === 'PATCH' ? json({ message: 'taken', code: 'EMAIL_TAKEN' }, 409) : undefined))
    renderPage()
    const email = await screen.findByLabelText(/^Email/)
    await userEvent.clear(email)
    await userEvent.type(email, 'other@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Этот email уже у другого сотрудника')).toBeTruthy()
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('other@example.com')
  })

  it('saves the whole set of roles and says the change is not immediate', async () => {
    const { calls } = server(employeeFixture, (c, state) => {
      if (c.method === 'PUT') {
        state.current = { ...state.current, roles: ['developer', 'admin'] }
        return json(state.current)
      }
      return undefined
    })
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Иванов Иван Петрович' })
    expect(screen.getByText(/Изменение вступит в силу не сразу/)).toBeTruthy()
    await userEvent.click(screen.getByRole('checkbox', { name: /Администратор/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить роли' }))
    expect(await screen.findByText('Роли сохранены')).toBeTruthy()
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ roles: ['developer', 'admin'] })
  })

  it('explains LAST_ADMIN for roles and returns the boxes to the server set', async () => {
    server(adminEmployeeFixture, (c) => (c.method === 'PUT' ? json({ message: 'last', code: 'LAST_ADMIN' }, 409) : undefined))
    renderPage('e2')
    await screen.findByRole('heading', { level: 1, name: 'Котова Анна Сергеевна' })
    await userEvent.click(screen.getByRole('checkbox', { name: /Администратор/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить роли' }))
    expect(await screen.findByText('Нельзя оставить систему без администратора')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: /Администратор/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('dismisses only after the confirmation, and cancelling changes nothing', async () => {
    const { calls } = server(employeeFixture, (c, state) => {
      if (c.method === 'POST' && c.path.endsWith('/dismiss')) {
        state.current = { ...state.current, isActive: false }
        return json(state.current)
      }
      return undefined
    })
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Иванов Иван Петрович' })
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отмена' }))
    expect(calls.some((c) => c.path.endsWith('/dismiss'))).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Уволить' }))
    expect(await screen.findByText('Уволен')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Вернуть' })).toBeTruthy()
  })

  it('explains LAST_ADMIN for the dismissal and leaves the employee active', async () => {
    server(adminEmployeeFixture, (c) => (c.method === 'POST' && c.path.endsWith('/dismiss') ? json({ message: 'last', code: 'LAST_ADMIN' }, 409) : undefined))
    renderPage('e2')
    await screen.findByRole('heading', { level: 1, name: 'Котова Анна Сергеевна' })
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Уволить' }))
    expect(await screen.findByText('Нельзя оставить систему без администратора')).toBeTruthy()
    expect(screen.getByText('Активен')).toBeTruthy()
  })

  it('restores a dismissed employee without a confirmation', async () => {
    const { calls } = server(dismissedEmployeeFixture, (c, state) => {
      if (c.method === 'POST' && c.path.endsWith('/restore')) {
        state.current = { ...state.current, isActive: true }
        return json(state.current)
      }
      return undefined
    })
    renderPage('e4')
    await screen.findByRole('heading', { level: 1, name: 'Лебедев Олег Викторович' })
    expect(screen.getByText('Уволен')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Вернуть' }))
    expect(await screen.findByText('Активен')).toBeTruthy()
    expect(calls.some((c) => c.path.endsWith('/restore'))).toBe(true)
  })

  it('shows the login as the name for an employee without the full name and asks to fill the profile', async () => {
    server(noNameEmployeeFixture)
    renderPage('e6')
    expect(await screen.findByRole('heading', { level: 1, name: 'petrov' })).toBeTruthy()
    expect(screen.getByText(/Профиль не заполнен/)).toBeTruthy()
  })
})

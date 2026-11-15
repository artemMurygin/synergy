import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { employeeFixture } from '@/features/employees/model/employees.fixtures'
import { departmentFixture, departmentWithoutHead } from '@/features/departments/model/fixtures'
import { createTestClient, json, queryWrapper, stubFetch, type FetchCall } from '@/test/helpers'
import { EmployeeCreatePage } from './EmployeeCreatePage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'e2', login: 'akotova', mustChangePassword: false, roles: ['admin'], fullName: 'Котова Анна Сергеевна', lastName: 'Котова', firstName: 'Анна', middleName: 'Сергеевна', position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function CardProbe() {
  const state = useLocation().state as { created?: boolean } | null
  return <p>card-of-created{state?.created ? ' (created)' : ''}</p>
}

function renderPage() {
  const client = createTestClient()
  const Wrapper = queryWrapper(client)
  render(
    <Wrapper>
      <MemoryRouter initialEntries={['/admin/employees/new']}>
        <Routes>
          <Route path="/admin/employees" element={<p>list-page</p>} />
          <Route path="/admin/employees/new" element={<EmployeeCreatePage />} />
          <Route path="/admin/employees/:id" element={<CardProbe />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
  return client
}

function api(create: (c: FetchCall) => Response) {
  return stubFetch((c) => {
    if (c.path === '/admin/departments') return json([departmentFixture])
    if (c.path === '/admin/employees' && c.method === 'POST') return create(c)
    return json({}, 404)
  })
}

const created = () => json({ employee: { ...employeeFixture, id: 'e-new' }, temporaryPassword: 'Kp7#vR2q-Lm9x' }, 201)

async function fillRequired(login = 'ivanov') {
  await userEvent.type(screen.getByLabelText(/^Логин/), login)
  await userEvent.type(screen.getByLabelText(/^Фамилия/), 'Иванов')
  await userEvent.type(screen.getByLabelText(/^Имя/), 'Иван')
}

describe('EmployeeCreatePage', () => {
  it('shows the back link, the heading, the caption and the form', () => {
    api(created)
    renderPage()
    expect(screen.getByRole('link', { name: /Сотрудники/ }).getAttribute('href')).toBe('/admin/employees')
    expect(screen.getByRole('heading', { name: 'Новый сотрудник' })).toBeTruthy()
    expect(screen.getByText('После создания портал покажет временный пароль. При первом входе сотрудник сменит его')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Создать сотрудника' })).toBeTruthy()
  })

  it('does not send the form without the surname', async () => {
    const { calls } = api(created)
    renderPage()
    await userEvent.type(screen.getByLabelText(/^Логин/), 'ivanov')
    await userEvent.type(screen.getByLabelText(/^Имя/), 'Иван')
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(await screen.findByText('Укажите фамилию')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows the temporary password once and opens the card of the created employee after it is closed', async () => {
    const { calls } = api(created)
    renderPage()
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(await screen.findByRole('alertdialog', { name: 'Сотрудник создан' })).toBeTruthy()
    expect(screen.getByText('Kp7#vR2q-Lm9x')).toBeTruthy()
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ login: 'ivanov', lastName: 'Иванов', firstName: 'Иван' })
    expect(screen.queryByText('card-of-created')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Готово/ }))
    expect(await screen.findByText('card-of-created (created)')).toBeTruthy()
    expect(screen.queryByText('Kp7#vR2q-Lm9x')).toBeNull()
  })

  it('shows the taken login at the field and keeps what was typed', async () => {
    api(() => json({ message: 'taken', code: 'LOGIN_TAKEN' }, 409))
    renderPage()
    await fillRequired('ivanov.i')
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(await screen.findByText('Этот логин уже занят')).toBeTruthy()
    expect((screen.getByLabelText(/^Логин/) as HTMLInputElement).value).toBe('ivanov.i')
    expect((screen.getByLabelText(/^Фамилия/) as HTMLInputElement).value).toBe('Иванов')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('a refetch of the page data does not bring back a server error the user has started to correct', async () => {
    let departmentCalls = 0
    stubFetch((c) => {
      if (c.path === '/admin/departments') return json(++departmentCalls > 1 ? [departmentFixture, departmentWithoutHead] : [departmentFixture])
      return json({ message: 'taken', code: 'LOGIN_TAKEN' }, 409)
    })
    const client = renderPage()
    await fillRequired('ivanov.i')
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(await screen.findByText('Этот логин уже занят')).toBeTruthy()
    await userEvent.type(screen.getByLabelText(/^Логин/), '2')
    expect(screen.queryByText('Этот логин уже занят')).toBeNull()
    await userEvent.click(screen.getByLabelText(/^Фамилия/))
    await client.invalidateQueries({ queryKey: ['departments'] })
    await screen.findByRole('option', { name: 'Разработка' })
    expect(screen.queryByText('Этот логин уже занят')).toBeNull()
    expect(document.activeElement).not.toBe(screen.getByLabelText(/^Логин/))
  })

  it('"Отмена" returns to the list', async () => {
    api(created)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.getByText('list-page')).toBeTruthy()
  })
})
